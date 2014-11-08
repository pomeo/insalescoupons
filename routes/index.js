var express     = require('express'),
    router      = express.Router(),
    mongoose    = require('mongoose'),
    Schema      = mongoose.Schema,
    kue         = require('kue'),
    jobs        = kue.createQueue({
      prefix: 'coupons',
      disableSearch: true,
      redis: {
        host: process.env.redis
      }
    }),
    Q           = require('q'),
    rest        = require('restler'),
    xml2js      = require('xml2js'),
    crypto      = require('crypto'),
    moment      = require('moment'),
    hat         = require('hat'),
    rack        = hat.rack(),
    async       = require('async'),
    cc          = require('coupon-code'),
    _           = require('lodash'),
    array       = require('array'),
    winston     = require('winston'),
    Loggly      = require('winston-loggly').Loggly

if (process.env.NODE_ENV === 'development') {
  var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)()
    ]
  });
} else {
  var logger = new (winston.Logger)({
    transports: [
      new (Loggly)({
        subdomain: process.env.loggly_subdomain,
        inputToken: process.env.loggly_token,
        tags: ['coupons']
      })
    ]
  });
}

jobs.promote(610,1);

router.get('/', function(req, res) {
  if (req.query.token && (req.query.token !== '')) {
    Apps.findOne({autologin:req.query.token}, function(err, a) {
      if (a) {
        log('Создаём сессию и перебрасываем на главную');
        req.session.insalesid = a.insalesid;
        res.redirect('/');
      } else {
        log('Ошибка автологина. Неправильный token при переходе из insales', 'warn')
        res.send('Ошибка автологина', 403);
      }
    });
  } else {
    var insid = req.session.insalesid || req.query.insales_id;
    log('Попытка входа магазина: ' + insid);
    if ((req.query.insales_id &&
         (req.query.insales_id !== '')) ||
        req.session.insalesid !== undefined) {
      Apps.findOne({insalesid:insid}, function(err, app) {
        if (app.enabled == true) {
          Settings.find({insalesid:insid}, function(err, settings) {
            if (req.session.insalesid) {
              var sett = {};
              async.each(settings, function(s, callback) {
                sett[s.property] = s.value;
                callback();
              }, function(e) {
                   if (e) {
                     log('Ошибка во время работы async. Вывод свойств формы генерации в шаблон', 'error');
                     log(e, 'error');
                   } else {
                     res.render('index', {
                       title    : '',
                       number   : typeof sett['coupon-number'] !== 'undefined' ? sett['coupon-number'] : 5,
                       parts    : typeof sett['coupon-parts'] !== 'undefined' ? sett['coupon-parts'] : 3,
                       length   : typeof sett['coupon-part-lengths'] !== 'undefined' ? sett['coupon-part-lengths'] : 6,
                       act      : typeof sett['coupon-act'] !== 'undefined' ? sett['coupon-act'] : 1,
                       variants : typeof sett['coupon-variants'] !== 'undefined' ? sett['coupon-variants'] : 1,
                       type     : typeof sett['coupon-type-discount'] !== 'undefined' ? sett['coupon-type-discount'] : 1,
                       discount : typeof sett['coupon-discount'] !== 'undefined' ? sett['coupon-discount'] : '',
                       expired  : typeof sett['coupon-until'] !== 'undefined' ? sett['coupon-until'] : '01.01.2016'
                     });
                   }
                 });
            } else {
              log('Авторизация ' + req.query.insales_id);
              var id = hat();
              app.autologin = crypto.createHash('md5')
                              .update(id + app.token)
                              .digest('hex');
              app.save(function (err) {
                if (err) {
                  res.send(err, 500);
                } else {
                  res.redirect('http://' + app.insalesurl
                              + '/admin/applications/'
                              + process.env.insalesid
                              + '/login?token='
                              + id
                              + '&login=http://localhost');
                }
              });
            }
          });
        } else {
          res.send('Приложение не установлено для данного магазина', 403);
        }
      });
    } else {
      res.send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти', 403);
    }
  }
});

router.post('/generate', function(req, res) {
  if (req.session.insalesid) {
    var n = parseInt(req.param('c-num'));
    var n_exist = -1;
    var p = parseInt(req.param('c-part'));
    var p_exist = -1;
    var l = parseInt(req.param('c-partlen'));
    var l_exist = -1;
    var a = parseInt(req.param('act'));
    var a_exist = -1;
    var v = parseInt(req.param('variants'));
    var v_exist = -1;
    var t = parseInt(req.param('typediscount'));
    var t_exist = -1;
    var d = parseFloat(req.param('discount'));
    var d_exist = -1;
    var u = moment(req.param('until'), 'DD.MM.YYYY').format('DD.MM.YYYY');
    var u_exist = -1;
    var g = req.param('group');
    if ((n >= 1) && (n <= 10000) && (p >= 1) && (p <= 5) && (l >= 4) && (l <= 10)) {
      Apps.findOne({insalesid:req.session.insalesid}, function(err, app) {
        for (var i = 0; i < app.settings.length; ++i) {
          if (app.settings[i].property == 'coupon-number') {
            n_exist = i;
          } else if (app.settings[i].property == 'coupon-parts') {
            p_exist = i;
          } else if (app.settings[i].property == 'coupon-part-length') {
            l_exist = i;
          } else if (app.settings[i].property == 'coupon-act') {
            a_exist = i;
          } else if (app.settings[i].property == 'coupon-variants') {
            v_exist = i;
          } else if (app.settings[i].property == 'type-discount') {
            t_exist = i;
          } else if (app.settings[i].property == 'discount') {
            d_exist = i;
          } else if (app.settings[i].property == 'coupon-expired') {
            u_exist = i;
          }
        }
        if (n_exist !== -1) {
          app.settings[n_exist].value = n;
          app.settings[n_exist].updated_at = new Date();
        } else {
          app.settings.push({
            property    : 'coupon-number',
            value       : n,
            created_at  : new Date(),
            updated_at  : new Date()
          });
        }
        if (p_exist !== -1) {
          app.settings[p_exist].value = p;
          app.settings[p_exist].updated_at = new Date();
        } else {
          app.settings.push({
            property    : 'coupon-parts',
            value       : p,
            created_at  : new Date(),
            updated_at  : new Date()
          });
        }
        if (l_exist !== -1) {
          app.settings[l_exist].value = l;
          app.settings[l_exist].updated_at = new Date();
        } else {
          app.settings.push({
            property    : 'coupon-part-length',
            value       : l,
            created_at  : new Date(),
            updated_at  : new Date()
          });
        }
        if (a_exist !== -1) {
          app.settings[a_exist].value = a;
          app.settings[a_exist].updated_at = new Date();
        } else {
          app.settings.push({
            property    : 'coupon-act',
            value       : a,
            created_at  : new Date(),
            updated_at  : new Date()
          });
        }
        if (v_exist !== -1) {
          app.settings[v_exist].value = v;
          app.settings[v_exist].updated_at = new Date();
        } else {
          app.settings.push({
            property    : 'coupon-variants',
            value       : v,
            created_at  : new Date(),
            updated_at  : new Date()
          });
        }
        if (t_exist !== -1) {
          app.settings[t_exist].value = t;
          app.settings[t_exist].updated_at = new Date();
        } else {
          app.settings.push({
            property    : 'type-discount',
            value       : t,
            created_at  : new Date(),
            updated_at  : new Date()
          });
        }
        if (d_exist !== -1) {
          app.settings[d_exist].value = d;
          app.settings[d_exist].updated_at = new Date();
        } else {
          app.settings.push({
            property    : 'discount',
            value       : d,
            created_at  : new Date(),
            updated_at  : new Date()
          });
        }
        if (u_exist !== -1) {
          app.settings[u_exist].value = u;
          app.settings[u_exist].updated_at = new Date();
        } else {
          app.settings.push({
            property    : 'coupon-expired',
            value       : u,
            created_at  : new Date(),
            updated_at  : new Date()
          });
        }
        app.save(function (e) {
          if (e) {
            res.send(e, 500);
          } else {
            jobs.create('coupons', {
              id: req.session.insalesid,
              type: 1, //создание задания на создание купонов
              numbers: n,
              parts: p,
              length: l,
              act: a,
              variants: v,
              typediscount: t,
              discount: d,
              until: u,
              group: g
            }).delay(1).priority('critical').save();
            res.send('success');
          }
        });
      });
    } else {
      res.send('ошибка');
    }
  } else {
    res.send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти', 403);
  }
})

router.get('/sample', function(req, res) {
  if (req.session.insalesid) {
    var p = parseInt(req.param('parts'));
    var l = parseInt(req.param('length'));
    if ((p >= 1) && (p <= 5) && (l >= 4) && (l <= 10)) {
      res.json(cc.generate({ parts: p, partLen: l }));
    } else {
      res.json('ошибка запроса');
    }
  } else {
    res.send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти', 403);
  }
})

function createCoupon(job, done) {
  Apps.findOne({insalesid:job.data.id}, function(err, app) {
    log(job.data);
    var coupon = '<?xml version=\"1.0\" encoding=\"UTF-8\"?>'
               + '<discount_code>'
               + '<code>' + job.data.coupon + '</code>'
               + '<act_once>' + job.data.act + '</act_once>'
               + '<discount>' + job.data.discount + '</discount>'
               + '<type_id>' + job.data.typediscount + '</type_id>'
               + '<description>генератор купонов</description>'
               + '<disabled>0</disabled>'
               + '<expired-at>' + moment(job.data.until, 'DD.MM.YYYY').format('YYYY-MM-DD') + '</expired-at>'
               + '</discount_code>';
    rest.post('http://' + process.env.insalesid + ':' + a.token + '@' + a.insalesurl + '/admin/discount_codes.xml', {
      data: coupon,
      headers: {'Content-Type': 'application/xml'}
    }).once('complete', function(o) {
      if (o.errors) {
        log('Ошибка');
        log(o);
        done();
      } else {
        log(o);
        done();
      }
    });
  });
}

jobs.process('coupons', function(job, done) {
  if (job.data.type === 1) {
    for (var i = 0; i < job.data.numbers; i++) {
      jobs.create('coupons', {
        id: job.data.id,
        type: 2, // создание заданий на создание каждого конкретного купона
        coupon: cc.generate({ parts: job.data.parts, partLen: job.data.length }),
        act: job.data.act,
        variant: job.data.variants,
        discount: job.data.discount,
        typediscount: job.data.typediscount,
        until: job.data.until
      }).delay(1).priority('normal').save();
    }
    done();
  } else if (job.data.type === 2) {
    if (job.data.variant === 1) {
      log(job.data);
      done();
    } else if (job.data.variant === 2) {
      createCoupon(job, done);
    } else if (job.data.variant === 3) {
      log(job.data);
      done();
    } else if (job.data.variant === 4) {
      log(job.data);
      done();
    }
  }
});

router.get('/install', function(req, res) {
  if ((req.query.shop !== '') && (req.query.token !== '') && (req.query.insales_id !== '') && req.query.shop && req.query.token && req.query.insales_id) {
    Apps.findOne({insalesid:req.query.insales_id}, function(err, a) {
      if (a == null) {
        var app = new Apps({
          insalesid  : req.query.insales_id,
          insalesurl : req.query.shop,
          token      : crypto.createHash('md5').update(req.query.token + process.env.insalessecret).digest('hex'),
          created_at : moment().format('ddd, DD MMM YYYY HH:mm:ss ZZ'),
          updated_at : moment().format('ddd, DD MMM YYYY HH:mm:ss ZZ'),
          enabled    : true
        });
        app.save(function (err) {
          if (err) {
            res.send(err, 500);
          } else {
            res.send(200);
          }
        });
      } else {
        if (a.enabled == true) {
          res.send('Приложение уже установленно', 403);
        } else {
          a.token = crypto.createHash('md5')
                    .update(req.query.token + process.env.insalessecret)
                    .digest('hex');
          a.updated_at = moment().format('ddd, DD MMM YYYY HH:mm:ss ZZ');
          a.enabled = true;
          a.save(function (err) {
            if (err) {
              res.send(err, 500);
            } else {
              res.send(200);
            }
          });
        }
      }
    });
  } else {
    res.send('Ошибка установки приложения', 403);
  }
});

router.get('/uninstall', function(req, res) {
  if ((req.query.shop !== '') &&
      (req.query.token !== '') &&
      (req.query.insales_id !== '') &&
      req.query.shop &&
      req.query.token &&
      req.query.insales_id) {
    Apps.findOne({insalesid:req.query.insales_id}, function(err, a) {
      if (a.token == req.query.token) {
        a.updated_at = moment().format('ddd, DD MMM YYYY HH:mm:ss ZZ');
        a.enabled = false;
        a.save(function (err) {
          if (err) {
            res.send(err, 500);
          } else {
            res.send(200);
          }
        });
      } else {
        res.send('Ошибка удаления приложения', 403);
      }
    });
  } else {
    res.send('Ошибка удаления приложения', 403);
  }
});

module.exports = router;

mongoose.connect('mongodb://' + process.env.mongo + '/coupons');

var ChargesSchema = new Schema();

ChargesSchema.add({
  insalesid        : { type: Number, index: true }, // id магазина
  guid             : { type: Number, index: true }, // id списания
  type             : Number, // для себя, платит магазин за приложение или нет
  monthly          : Number, // сумма
  blocked          : Boolean, //
  paid_till        : Date, // заплатить до этой даты
  trial_expired_at : Date, // триал заканчивается в эту дату
  updated_at       : Date, // дата из ответа insales
  created_at       : Date // дата из ответа insales
});

var Charges = mongoose.model('Charges', ChargesSchema);

var GroupsSchema = new Schema();

GroupsSchema.add({
  insalesid   : { type: Number, index: true }, // id магазина
  groupid     : { type: String, unique: true }, // id группы
  groupname   : { type: String, index: true }, // название группы
  created_at  : Date // дата создания группы
});

var Groups = mongoose.model('Groups', GroupsSchema);

var CollectionsSchema = new Schema();

CollectionsSchema.add({
  insalesid   : { type: Number, index: true }, // id магазина
  colid       : { type: Number, index: true }, // id категории
  name        : String, // название категории
  parentid    : { type: Number, index: true }, // id родительской категории
  created_at  : Date, // дата создания категории
  updated_at  : Date // дата изменения категории
});

var Collections = mongoose.model('Collections', CollectionsSchema);

var TasksSchema = new Schema();

TasksSchema.add({
  insalesid   : { type: Number, index: true }, // id магазина
  type        : { type: Number, index: true }, // тип задания
  status      : Number, // статус задания
  groupid     : String, // id группы в цепочке заданий
  created_at  : Date, // дата создания
  updated_at  : Date // дата изменения
});

var Tasks = mongoose.model('Tasks', TasksSchema);

var SettingsSchema = new Schema();

SettingsSchema.add({
  insalesid   : { type: Number, index: true }, // id магазина
  property    : { type: String, index: true }, // свойство
  value       : String, // значение свойства
  created_at  : Date, // дата создания
  updated_at  : Date // дата изменения
});

var Settings = mongoose.model('Settings', SettingsSchema);

var CouponsSchema = new Schema();

CouponsSchema.add({
  insalesid           : { type: Number, index: true }, // id магазина
  guid                : { type: Number, index: true }, // id купона
  сode                : String, // код купона
  description         : String, // описание купона
  act                 : Boolean, // одноразовый или многоразовый купон
  actclient           : Boolean, // одноразовый для зарегистрированного покупателя
  typeid              : Number, // тип скидки
  discount            : Number, // размер скидки
  minprice            : Number, // минимальная цена при которой купон не раборает
  worked              : Boolean, // использованный купон или нет
  discountcollections : Array, // массив id разделов
  expired_at          : Date, // дата истечения купона, от insales
  created_at          : Date, // дата создания купона, от insales
  updated_at          : Date, // дата обновления купона, от insales
  disabled            : Boolean // активный/неактивный купон
});

var Coupons = mongoose.model('Coupons', CouponsSchema);

var AppsSchema = new Schema();

AppsSchema.add({
  insalesid   : { type: Number, unique: true }, // id магазина
  insalesurl  : String, // урл магазина
  token       : String, // ключ доступа к api
  autologin   : String, // сохраняется ключ автологина
  created_at  : Date, // дата создания записи
  updated_at  : Date, // дата изменения записи
  enabled     : Boolean // установлено или нет приложение для магазина
});

var Apps = mongoose.model('Apps', AppsSchema);

//Логгер в одном месте, для упрощения перезда на любой логгер.
function log(logMsg, logType) {
  if (logMsg instanceof Error) logger.error(logMsg.stack);
  if (logType !== undefined) {
    logger.log(logType, logMsg);
  } else {
    logger.info(logMsg);
  }
};