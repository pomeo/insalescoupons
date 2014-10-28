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
    async       = require('async'),
    cc          = require('coupon-code'),
    _           = require('lodash'),
    array       = require('array'),
    winston     = require('winston'),
    Logstash    = require('winston-logstash').Logstash,
    logger      = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)(),
        new (Logstash)({
          port: 28777,
          node_name: 'coupons',
          host: process.env.logstash
        })
      ]
    }),
    debugOn     = true;

jobs.promote(600,1);

router.get('/', function(req, res) {
  if (req.query.token && (req.query.token !== '')) {
    Apps.findOne({autologin:req.query.token}, function(err, a) {
      if (a) {
        req.session.insalesid = a.insalesid;
        res.redirect('/');
      } else {
        res.send('Ошибка автологина', 403);
      }
    });
  } else {
    var insid = req.session.insalesid || req.query.insales_id;
    log('Попытка входа магазина: ' + insid);
    if ((req.query.insales_id && (req.query.insales_id !== '')) || req.session.insalesid !== undefined) {
      Apps.findOne({insalesid:insid}, function(err, app) {
        if (app.enabled == true) {
          if (req.session.insalesid) {
            var n = -1;
            var number;
            var p = -1;
            var parts;
            var l = -1;
            var length;
            var v = -1;
            var act;
            var a = -1;
            var variants;
            var t = -1;
            var type;
            var d = -1;
            var discount;
            var u = -1;
            var expired;
            for (var i = 0; i < app.settings.length; ++i) {
              if (app.settings[i].property == 'coupon-number') {
                n = app.settings[i].value;
              } else if (app.settings[i].property == 'coupon-parts') {
                p = app.settings[i].value;
              } else if (app.settings[i].property == 'coupon-part-length') {
                l = app.settings[i].value;
              } else if (app.settings[i].property == 'coupon-act') {
                a = app.settings[i].value;
              } else if (app.settings[i].property == 'coupon-variants') {
                v = app.settings[i].value;
              } else if (app.settings[i].property == 'type-discount') {
                t = app.settings[i].value;
              } else if (app.settings[i].property == 'discount') {
                d = app.settings[i].value;
              } else if (app.settings[i].property == 'coupon-expired') {
                u = app.settings[i].value;
              }
            }
            if (n !== -1) {
              number = n;
            } else {
              number = 5;
            }
            if (p !== -1) {
              parts = p;
            } else {
              parts = 3;
            }
            if (l !== -1) {
              length = l;
            } else {
              length = 6;
            }
            if (a !== -1) {
              act = a;
            } else {
              act = 1;
            }
            if (v !== -1) {
              variants = v;
            } else {
              variants = 1;
            }
            if (t !== -1) {
              type = t;
            } else {
              type = 1;
            }
            if (d !== -1) {
              discount = d;
            } else {
              discount = '';
            }
            if (u !== -1) {
              expired = u;
            } else {
              expired = '01.01.2016';
            }
            res.render('index', {
              title    : '',
              number   : number,
              parts    : parts,
              length   : length,
              act      : act,
              variants : variants,
              type     : type,
              discount : discount,
              expired  : expired
            });
          } else {
            log('Авторизация ' + req.query.insales_id, 'info');
            var id = hat();
            app.autologin = crypto.createHash('md5').update(id + app.token).digest('hex');
            app.save(function (err) {
              if (err) {
                res.send(err, 500);
              } else {
                res.redirect('http://' + app.insalesurl + '/admin/applications/' + process.env.insalesid + '/login?token=' + id + '&login=http://localhost');
              }
            });
          }
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
          a.token = crypto.createHash('md5').update(req.query.token + process.env.insalessecret).digest('hex');
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
  if ((req.query.shop !== '') && (req.query.token !== '') && (req.query.insales_id !== '') && req.query.shop && req.query.token && req.query.insales_id) {
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

var CollectionsSchema = new Schema();

CollectionsSchema.add({
  type        : { type: Number, index: true },
  status      : Number,
  groupid     : String,
  grouptype   : Number,
  created_at  : Date,
  updated_at  : Date
});

var TasksSchema = new Schema();

TasksSchema.add({
  type        : { type: Number, index: true },
  status      : Number,
  groupid     : String,
  grouptype   : Number,
  created_at  : Date,
  updated_at  : Date
});

var SettingsSchema = new Schema();

SettingsSchema.add({
  property    : { type: String, index: true },
  value       : String,
  created_at  : Date,
  updated_at  : Date
});

var CouponsSchema = new Schema();

CouponsSchema.add({
  guid                : { type: Number, index: true },
  сode                : String,
  description         : String,
  act                 : Boolean,
  actclient           : Boolean,
  typeid              : Number,
  discount            : Number,
  minprice            : Number,
  worked              : Boolean,
  discountcollections : Array,
  expired_at          : Date,
  created_at          : Date,
  updated_at          : Date,
  disabled            : Boolean
});

var AppsSchema = new Schema();

AppsSchema.add({
  insalesid   : { type: String, unique: true },
  insalesurl  : String,
  token       : String,
  autologin   : String,
  settings    : [SettingsSchema],
  coupons     : [CouponsSchema],
  tasks       : [TasksSchema],
  collections : [CollectionsSchema],
  created_at  : Date,
  updated_at  : Date,
  enabled     : Boolean
});

var Apps = mongoose.model('Apps', AppsSchema);

//Логгер в одном месте, для упрощения перезда на любой логгер.
function log(logMsg, logType) {
  if (logMsg instanceof Error) logger.error(logMsg.stack);
  if (debugOn) {
    if (logType !== undefined) {
      logger.log(logType, logMsg);
    } else {
      logger.info(logMsg);
    }
  }
};