var express     = require('express'),
    router      = express.Router(),
    mongoose    = require('mongoose'),
    Schema      = mongoose.Schema,
    kue         = require('kue'),
    jobs        = kue.createQueue({
      prefix: 'q',
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
    Logentries  = require('winston-logentries');

if (process.env.NODE_ENV === 'development') {
  var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)()
    ]
  });
} else {
  var logger = new (winston.Logger)({
    transports: [
      new winston.transports.Logentries({token: process.env.logentries})
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

router.get('/zadaniya', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid: req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        Tasks.find({insalesid: req.session.insalesid}, function(err, tasks) {
          async.each(tasks, function(task, callback) {
            log(task.groupid);
            callback();
          }, function(err) {
               res.render('tasks', {
                 title    : ''
               });
             });
        })
      } else {
        res.send('Приложение не установлено для данного магазина', 403);
      }
    })
  } else {
    res.send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти', 403);
  }
});

router.get('/import-export', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid: req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        res.render('io', {
          title    : ''
        });
      } else {
        res.send('Приложение не установлено для данного магазина', 403);
      }
    })
  } else {
    res.send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти', 403);
  }
});

router.get('/opisanie', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid: req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        res.render('desc', {
          title    : ''
        });
      } else {
        res.send('Приложение не установлено для данного магазина', 403);
      }
    })
  } else {
    res.send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти', 403);
  }
});

router.post('/generate', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid:req.session.insalesid
    }, function(err, app) {
         if (app.enabled == true) {
           var form = {
             'coupon-number': parseInt(req.param('c-num')),
             'coupon-parts': parseInt(req.param('c-part')),
             'coupon-part-lengths': parseInt(req.param('c-partlen')),
             'coupon-act': parseInt(req.param('act')),
             'coupon-variants': parseInt(req.param('variants')),
             'coupon-type-discount': parseInt(req.param('typediscount')),
             'coupon-discount': parseFloat(req.param('discount')),
             'coupon-until': moment(req.param('until'), 'DD.MM.YYYY')
                      .format('DD.MM.YYYY'),
             'coupon-group': req.param('group')
           };
           var exist = {
             'coupon-number': -1,
             'coupon-parts': -1,
             'coupon-part-lengths': -1,
             'coupon-act': -1,
             'coupon-variants': -1,
             'coupon-type-discount': -1,
             'coupon-discount': -1,
             'coupon-until': -1
           };
           if ((form['coupon-number'] >= 1) &&
               (form['coupon-number'] <= 10000) &&
               (form['coupon-parts'] >= 1) &&
               (form['coupon-parts'] <= 5) &&
               (form['coupon-part-lengths'] >= 4) &&
               (form['coupon-part-lengths'] <= 10)) {
             Settings.find({
               insalesid:req.session.insalesid
             }, function(err, settings) {
                  async.each(settings, function(s, callback) {
                    s.value = form[s.property];
                    s.updated_at = new Date();
                    s.save(function (err) {
                      if (err) {
                        log('Ошибка сохранения', 'error');
                        log(err, 'error');
                        callback();
                      } else {
                        exist[s.property] = 1;
                        log('Ok');
                        callback();
                      }
                    });
                  }, function(e) {
                       if (e) {
                         log('A coupons failed to process');
                       } else {
                         for (var prop in exist) {
                           if (exist[prop] == -1) {
                             var sett = new Settings({
                               insalesid   : req.session.insalesid,
                               property    : prop,
                               value       : form[prop],
                               created_at  : new Date(),
                               updated_at  : new Date()
                             });
                             sett.save(function (err) {
                               if (err) {
                                 log('Ошибка');
                                 log(err);
                               } else {
                                 log('Ok');
                               }
                             });
                           }
                         }
                         jobs.create('coupons', {
                           id: req.session.insalesid,
                           type: 1,
                           numbers: form['coupon-number'],
                           parts: form['coupon-parts'],
                           length: form['coupon-part-lengths'],
                           act: form['coupon-act'],
                           variant: form['coupon-variants'],
                           typediscount: form['coupon-type-discount'],
                           discount: form['coupon-discount'],
                           until: form['coupon-until'],
                           group: form['coupon-group']
                         }).delay(600).priority('critical').save();
                         log('Done');
                         res.json('success');
                       }
                     });
                });
           } else {
             res.send('ошибка');
           }
         } else {
           res.send('Приложение не установлено для данного магазина', 403);
         }
       });
  } else {
    res.send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти', 403);
  }
})

router.get('/sample', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid:req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        var p = parseInt(req.param('parts'));
        var l = parseInt(req.param('length'));
        if ((p >= 1) && (p <= 5) && (l >= 4) && (l <= 10)) {
          res.json(cc.generate({ parts: p, partLen: l }));
        } else {
          res.json('ошибка запроса');
        }
      } else {
        res.send('Приложение не установлено для данного магазина', 403);
      }
    });
  } else {
    res.send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти', 403);
  }
})

setInterval(function() {
  Tasks.aggregate([ {
    $match: {
      status: { $in : [1, 2] }
    }
  }, {
      $group: {
        _id: { insalesid: "$insalesid" },
        id: { $first: "$_id" }
      }
    }, {
      $sort : { _id : 1}
    }
  ], function (err, result) {
       if (err) {
         log(err);
       } else {
         //console.dir(result);
         for (var i = 0; i < result.length; i++) {
           Tasks.findById(result[i].id, function (err, task) {
             //console.log(task);
           })
         }
       }
     });
}, 5000 );

function deleteCouponsFromApp(job) {
  Coupons.remove({insalesid: job.data.id}, function(err, coupon) {
    if (err) {
      log('Ошибка');
    } else {
      log('Удалены купоны из базы приложения');
    }
  });
}

function createJobGetCoupons(job) {
  jobs.create('coupons', {
    id: job.data.id,
    page: 1,
    type: 3,
    numbers: job.data.numbers,
    parts: job.data.parts,
    length: job.data.length,
    act: job.data.act,
    variant: job.data.variant,
    typediscount: job.data.typediscount,
    discount: job.data.discount,
    until: job.data.until,
    group: job.data.group
  }).delay(1).priority('critical').save();
}

function getCouponsFromShop(job) {
  Apps.findOne({insalesid:job.data.id}, function(err, app) {
    if (app.enabled == true) {
      rest.get('http://' + process.env.insalesid
              + ':'
              + app.token
              + '@'
              + app.insalesurl
              + '/admin/discount_codes.xml', {
                query: {
                  page: job.data.page,
                  per_page: 250
                },
                headers: {'Content-Type': 'application/xml'}
              }).once('complete', function(o) {
        if (o instanceof Error) {
          log('Error:', o.message);
          this.retry(5000);
        } else {
          if (o.errors) {
            log('Ошибка');
          } else {
            if (typeof o['discount-codes'] === 'undefined') {
              log(job.data);
              if ((job.data.variant === 1) ||
                  (job.data.variant === 3) ||
                  (job.data.variant === 4)) {
                createJobDeleteCoupons(job);
              } else if (job.data.variant === 2) {
                createJobCreateCoupons(job);
              } else {
                log('Конец');
              }
            } else {
              var coupon = new Coupons();
              async.each(o['discount-codes']['discount-code'], function(coup, callback) {
                var coupon = new Coupons({
                  insalesid           : job.data.id,
                  guid                : coup['id'],
                  сode                : coup['code'],
                  description         : coup['description'],
                  act                 : coup['act-once'],
                  actclient           : coup['act-once-for-client'],
                  typeid              : coup['type-id'],
                  discount            : coup['discount'],
                  minprice            : coup['min-price'],
                  worked              : coup['worked'],
                  //discountcollections : coup['discount-collections'],
                  expired_at          : coup['expired-at'],
                  created_at          : coup['created-at'],
                  updated_at          : coup['updated-at'],
                  disabled            : coup['disabled']
                });
                coupon.save(function (err) {
                  if (err) {
                    log('Ошибка');
                    log(err);
                    callback();
                  } else {
                    log('Сохранён купон из магазина в базу приложения');
                    callback();
                  }
                });
              }, function(e) {
                   if (e) {
                     log('A coupons failed to process');
                   } else {
                     log('All coupons have been processed successfully ' + job.data.page);
                     job.data.page++;
                     jobs.create('coupons', {
                       id: job.data.id,
                       page: job.data.page,
                       type: 3,
                       numbers: job.data.numbers,
                       parts: job.data.parts,
                       length: job.data.length,
                       act: job.data.act,
                       variant: job.data.variant,
                       typediscount: job.data.typediscount,
                       discount: job.data.discount,
                       until: job.data.until,
                       group: job.data.group
                     }).delay(600).priority('high').save();
                   }
                 });
            }
          }
        }
      });
    } else {
      log('Приложение не установлено для данного магазина');
    }
  });
}

function createJobDeleteCoupons(job) {
  Coupons.find({
    insalesid:job.data.id
  }, function(err, coupons) {
       async.each(coupons, function(coup, callback) {
         jobs.create('coupons', {
           id: job.data.id,
           couponid: coup.guid,
           type: 4,
           numbers: job.data.numbers,
           parts: job.data.parts,
           length: job.data.length,
           act: job.data.act,
           variant: job.data.variant,
           typediscount: job.data.typediscount,
           discount: job.data.discount,
           until: job.data.until,
           group: job.data.group
         }).delay(600).priority('medium').save();
         callback();
       }, function(e) {
            if (e) {
              log('Ошибка');
            } else {
              createJobCreateCoupons(job);
            }
          });
     });
}

function deleteCoupons(job) {
  Apps.findOne({insalesid:job.data.id}, function(err, app) {
    if (app.enabled == true) {
      rest.del('http://' + process.env.insalesid + ':'
              + app.token + '@'
              + app.insalesurl
              + '/admin/discount_codes/'
              + job.data.couponid + '.xml', {
                headers: {'Content-Type': 'application/xml'}
              }).once('complete', function(o) {
        if (o !== null && o.errors) {
          log('Ошибка ' + JSON.stringify(o));
          var re = new RegExp(job.data.couponid,"g");
          if (o.errors.error.match(re)) {
            Coupons.findOneAndRemove({
              guid: job.data.couponid
            }, function (err, r){
                 if (err) {
                   log('Ошибка');
                 } else {
                   log('Удалён купон из магазина и базы приложения');
                 }
               });
          }
        } else {
          Coupons.findOneAndRemove({
            guid: job.data.couponid
          }, function (err, r){
               if (err) {
                 log('Ошибка');
               } else {
                 log('Удалён купон из магазина и базы приложения');
               }
             });
        }
      });
    } else {
      log('Приложение не установлено для данного магазина');
    }
  });
}

function createJobCreateCoupons(job) {
  for (var i = 0; i < job.data.numbers; i++) {
    jobs.create('coupons', {
      id: job.data.id,
      type: 2,
      coupon: cc.generate({ parts: job.data.parts, partLen: job.data.length }),
      act: job.data.act,
      discount: job.data.discount,
      typediscount: job.data.typediscount,
      until: job.data.until
    }).delay(1).priority('normal').save();
  }
}

function createCoupons(job) {
  Apps.findOne({insalesid:job.data.id}, function(err, app) {
    if (app.enabled == true) {
      var coupon = '<?xml version=\"1.0\" encoding=\"UTF-8\"?>'
                 + '<discount_code>'
                 + '<code>' + job.data.coupon + '</code>'
                 + '<act_once>' + job.data.act + '</act_once>'
                 + '<discount>' + job.data.discount + '</discount>'
                 + '<type_id>' + job.data.typediscount + '</type_id>'
                 + '<description>генератор купонов</description>'
                 + '<disabled>0</disabled>'
                 + '<expired-at>' + moment(job.data.until, 'DD.MM.YYYY')
                                    .format('YYYY-MM-DD') + '</expired-at>'
                 + '</discount_code>';
      rest.post('http://' + process.env.insalesid + ':'
               + app.token + '@'
               + app.insalesurl
               + '/admin/discount_codes.xml', {
        data: coupon,
        headers: {'Content-Type': 'application/xml'}
      }).once('complete', function(o) {
        if (o instanceof Error) {
          log('Error:', o.message);
          this.retry(5000);
        } else {
          if (o.errors) {
            log('Ошибка');
            log(o);
          } else {
            log(o);
            var coupon = new Coupons({
              insalesid           : job.data.id,
              guid                : o['discount-code']['id'],
              сode                : o['discount-code']['code'],
              description         : o['discount-code']['description'],
              act                 : o['discount-code']['act-once'],
              actclient           : o['discount-code']['act-once-for-client'],
              typeid              : o['discount-code']['type-id'],
              discount            : o['discount-code']['discount'],
              minprice            : o['discount-code']['min-price'],
              worked              : o['discount-code']['worked'],
              //discountcollections : o['discount-code']['discount-collections'],
              expired_at          : o['discount-code']['expired-at'],
              created_at          : o['discount-code']['created-at'],
              updated_at          : o['discount-code']['updated-at'],
              disabled            : o['discount-code']['disabled']
            });
            coupon.save(function (err) {
              if (err) {
                log('Ошибка');
                log(err);
              } else {
                log('Создан купон');
              }
            });
          }
        }
      });
    } else {
      log('Приложение не установлено для данного магазина');
    }
  });
}

jobs.process('coupons', function(job, done) {
  if (job.data.type === 1) { // создание задания
    if (job.data.variant === 1) {
      // удалить все купоны, создать новые
      deleteCouponsFromApp(job);
      createJobGetCoupons(job);
      done();
    } else if (job.data.variant === 2) {
      // создать новые, добавив к текущим
      deleteCouponsFromApp(job);
      createJobGetCoupons(job);
      done();
    } else if (job.data.variant === 3) {
      // удалить использованные, создать новые
      deleteCouponsFromApp(job);
      createJobGetCoupons(job);
      done();
    } else if (job.data.variant === 4) {
      // удалить неиспользованные, создать новые
      deleteCouponsFromApp(job);
      createJobGetCoupons(job);
      done();
    }
  } else if (job.data.type === 2) {
    // создаём купоны
    createCoupons(job);
    done();
  } else if (job.data.type === 3) {
    // достаём купоны из магазина
    getCouponsFromShop(job);
    done();
  } else if (job.data.type === 4) {
    // удаляем купоны из магазина
    deleteCoupons(job);
    done();
  }
});

router.get('/install', function(req, res) {
  if ((req.query.shop !== '') &&
      (req.query.token !== '') &&
      (req.query.insales_id !== '') &&
      req.query.shop &&
      req.query.token &&
      req.query.insales_id) {
    Apps.findOne({insalesid:req.query.insales_id}, function(err, a) {
      if (a == null) {
        var app = new Apps({
          insalesid  : req.query.insales_id,
          insalesurl : req.query.shop,
          token      : crypto.createHash('md5')
                       .update(req.query.token + process.env.insalessecret)
                       .digest('hex'),
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
  insalesid    : { type: Number, index: true }, // id магазина
  type         : { type: Number, index: true }, // тип задания
  status       : Number, // статус задания
  groupid      : { type: String, index: true }, // id группы в цепочке заданий
  numbers      : Number, // количество купонов
  parts        : Number, // количество частей купона
  length       : Number, // длина части купона
  act          : Number, // одно или много-разовый купон
  variant      : Number, // варианты развития задания
  typediscount : Number, // процент или денежная единица
  discount     : Number, // величина скидки
  until        : Date,   // срок действия купона
  group        : String, // название группы купона
  created_at   : Date,   // дата создания
  updated_at   : Date    // дата изменения
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