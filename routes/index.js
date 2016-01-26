'use strict';
const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const Schema     = mongoose.Schema;
const io         = require('redis.io');
const jobs       = io.createQueue({
  disableSearch: true,
  jobEvents: false,
  redis: {
    host: process.env.redis,
  }
});
const Push       = require('pushover-notifications');
const P          = new Push( {
  user: process.env.PUSHOVER_USER,
  token: process.env.PUSHOVER_TOKEN,
});
const xml2js     = require('xml2js');
const crypto     = require('crypto');
const fs         = require('fs');
const moment     = require('moment');
const hat        = require('hat');
const rack       = hat.rack();
const Agenda     = require('agenda');
const agenda     = new Agenda({
  db: {
    address: `${process.env.mongo}/coupons`,
  },
});
const as         = require('async');
const cc         = require('coupon-code');
const insales    = require('insales')({
  id: process.env.insalesid,
  secret: process.env.insalessecret,
});
const _          = require('lodash');
const xl         = require('excel4node');
const XLSX       = require('xlsx');
const formidable = require('formidable');
const log        = require('winston-logs')({
  production: {
    logentries: {
      token: process.env.logentries,
    },
  },
  development: {
    'console': {
      colorize: true,
    },
  },
});

router.get('/', function(req, res) {
  if (req.query.token && (req.query.token !== '')) {
    Apps.findOne({autologin:req.query.token}, function(err, a) {
      if (a) {
        log('Магазин id=' + a.insalesid + ' Создаём сессию и перебрасываем на главную');
        req.session.insalesid = a.insalesid;
        res.redirect('/');
      } else {
        log('Ошибка автологина. Неправильный token при переходе из insales', 'warn');
        res.render('block', {
          msg: 'Ошибка автологина'
        });
      }
    });
  } else {
    if (process.env.NODE_ENV === 'development') {
      req.session.insalesid = 74112;
    }
    var insid = req.session.insalesid || req.query.insales_id;
    if ((req.query.insales_id &&
         (req.query.insales_id !== '')) ||
        req.session.insalesid !== undefined) {
      Apps.findOne({insalesid:insid}, function(err, app) {
        if (app.enabled == true) {
          Settings.find({insalesid:insid}, function(err, settings) {
            if (req.session.insalesid) {
              var sett = {};
              as.each(settings, function(s, callback) {
                sett[s.property] = s.value;
                setImmediate(callback);
              }, function(e) {
                   if (e) {
                     log('Ошибка во время работы async. Вывод свойств формы генерации в шаблон', 'error');
                     log(e, 'error');
                   } else {
                     Charges.findOne({
                       insalesid: req.session.insalesid
                     }, function(err, charge) {
                          var ch = (_.isNull(charge)) ? false : charge.blocked;
                          if (ch) {
                            res.render('block', {
                              msg : 'Приложение заблокировано за неуплату'
                            });
                          } else {
                            res.render('index', {
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
                              + '&login=https://coupons.salesapps.ru');
                }
              });
            }
          });
        } else {
          res.render('block', {
            msg : 'Приложение не установлено для данного магазина'
          });
        }
      });
    } else {
      res.render('block', {
        msg : 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти'
      });
    }
  }
});

router.get('/zadaniya', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid: req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        Charges.findOne({
          insalesid: req.session.insalesid
        }, function(err, charge) {
             var ch = (_.isNull(charge)) ? false : charge.blocked;
             if (ch) {
               res.render('block', {
                 msg : 'Приложение заблокировано за неуплату'
               });
             } else {
               var T = Tasks.find({insalesid: req.session.insalesid});
               T.sort({created_at: -1});
               T.limit(50);
               T.exec(function(err, tasks) {
                 var tasksList = [];
                 var tasksDone = [];
                 var tasksProcessing = [];
                 as.each(tasks, function(task, callback) {
                   if (task.status == 3) {
                     if (_.isUndefined(task.message)) {
                       tasksDone.push({
                         'type'    : task.type,
                         'status'  : task.status,
                         'numbers' : task.numbers,
                         'variant' : task.variant,
                         'file'    : task.file,
                         'created' : moment(new Date(task.created_at))
                                     .format('DD/MM/YYYY HH:mm ZZ'),
                         'updated' : moment(new Date(task.updated_at))
                                     .format('DD/MM/YYYY HH:mm ZZ')
                       });
                       setImmediate(callback);
                     } else {
                       tasksDone.push({
                         'type'    : task.type,
                         'status'  : task.status,
                         'numbers' : task.numbers,
                         'variant' : task.variant,
                         'message' : task.message,
                         'created' : moment(new Date(task.created_at))
                                     .format('DD/MM/YYYY HH:mm ZZ'),
                         'updated' : moment(new Date(task.updated_at))
                                     .format('DD/MM/YYYY HH:mm ZZ')
                       });
                       setImmediate(callback);
                     }
                   } else if (task.status == 2) {
                     tasksProcessing.push({
                       'type'    : task.type,
                       'status'  : task.status,
                       'numbers' : task.numbers,
                       'variant' : task.variant,
                       'created' : moment(new Date(task.created_at))
                                   .format('DD/MM/YYYY HH:mm ZZ'),
                       'updated' : moment(new Date(task.updated_at))
                                   .format('DD/MM/YYYY HH:mm ZZ')
                     });
                     setImmediate(callback);
                   } else {
                     tasksList.push({
                       'type'    : task.type,
                       'status'  : task.status,
                       'numbers' : task.numbers,
                       'variant' : task.variant,
                       'created' : moment(new Date(task.created_at))
                                   .format('DD/MM/YYYY HH:mm ZZ'),
                       'updated' : moment(new Date(task.updated_at))
                                   .format('DD/MM/YYYY HH:mm ZZ')
                     });
                     setImmediate(callback);
                   }
                 }, function(err) {
                      res.render('tasks', {
                        _          : _,
                        tasks      : tasksList,
                        done       : tasksDone,
                        processing : tasksProcessing
                      });
                    });
               });
             }
           });
      } else {
        res.render('block', {
          msg : 'Приложение не установлено для данного магазина'
        });
      }
    })
  } else {
    res.render('block', {
      msg : 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти'
    });
  }
});

router.post('/input', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid: req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        if (req.param('data') == 1) {
          // синхронизация
          var T = new Tasks({
            insalesid: req.session.insalesid,
            type: 5,
            status: 1,
            count: 0,
            created_at : new Date(),
            updated_at : new Date()
          });
          T.save(function (err) {
            if (err) {
              log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + err, 'error');
              res.status(403).send('ошибка');
            } else {
              res.status(200).send('success');
            }
          });
        } else if (req.param('data') == 2) {
          // синхронизация
          var T = new Tasks({
            insalesid: req.session.insalesid,
            type: 8,
            status: 1,
            file: 0,
            count: 0,
            created_at : new Date(),
            updated_at : new Date()
          });
          T.save(function (err) {
            if (err) {
              log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + err, 'error');
              res.status(403).send('ошибка');
            } else {
              res.status(200).send('success');
            }
          });
        } else if (req.param('variants')) {
          // удаление
          var T = new Tasks({
            insalesid: req.session.insalesid,
            type: 6,
            status: 1,
            variant: parseInt(req.param('variants')),
            count: 0,
            created_at : new Date(),
            updated_at : new Date()
          });
          T.save(function (err) {
            if (err) {
              log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + err, 'error');
              res.status(403).send('ошибка');
            } else {
              res.status(200).send('success');
            }
          });
        } else {
          res.status(403).send('Ошибка');
        }
      } else {
        res.render('block', {
          msg : 'Приложение не установлено для данного магазина'
        });
      }
    })
  } else {
    res.render('block', {
      msg : 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти'
    });
  }
});

router.get('/import-export', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid: req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        Charges.findOne({
          insalesid: req.session.insalesid
        }, function(err, charge) {
             var ch = (_.isNull(charge)) ? false : charge.blocked;
             if (ch) {
               res.render('block', {
                 msg : 'Приложение заблокировано за неуплату'
               });
             } else {
               res.render('io');
             }
           });
      } else {
        res.render('block', {
          msg : 'Приложение не установлено для данного магазина'
        });
      }
    })
  } else {
    res.render('block', {
      msg : 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти'
    });
  }
});

router.post('/import', function(req, res) {
  if (req.session.insalesid) {
    var form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.on('error', function(err) {
      log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + err, 'error');
    });

    form.on('end', function() {
      res.send('ok');
    });

    form.parse(req, function(err, fields, files) {
      var T = new Tasks({
        insalesid: req.session.insalesid,
        type: 7,
        status: 1,
        path: files['files[]'].path,
        count: 0,
        created_at : new Date(),
        updated_at : new Date()
      });
      T.save(function (err) {
        if (err) {
          log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + err, 'error');
        } else {
          log('Done');
        }
      });
    });
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
  }
});

router.get('/export', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid: req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        var path = __dirname + '/../files/' + req.session.insalesid + '/coupons.xlsx';
        fs.exists(path, function(exists) {
          if (exists) {
            var stat = fs.statSync(path);
            res.writeHead(200, {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Length': stat.size,
              'Content-Disposition': 'attachment; filename=coupons.xlsx'
            });
            var readStream = fs.createReadStream(path);
            readStream.on('open', function () {
              readStream.pipe(res);
            });
            readStream.on('error', function(err) {
              log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + err, 'error');
              res.status(500).send('Произошла ошибка');
            });
          } else {
            res.status(200).send('Файл отсуствует');
          }
        });
      } else {
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    })
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
  }
});

router.get('/opisanie', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid: req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        Charges.findOne({
          insalesid: req.session.insalesid
        }, function(err, charge) {
             var ch = (_.isNull(charge)) ? false : charge.blocked;
             if (ch) {
               res.render('block', {
                 msg : 'Приложение заблокировано за неуплату'
               });
             } else {
               res.render('desc');
             }
           });
      } else {
        res.render('block', {
          msg : 'Приложение не установлено для данного магазина'
        });
      }
    })
  } else {
    res.render('block', {
      msg : 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти'
    });
  }
});

router.post('/generate', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid:req.session.insalesid
    }, function(err, app) {
         if (app.enabled == true) {
           var form = {
             'coupon-number': parseInt(req.body['c-num']),
             'coupon-parts': parseInt(req.body['c-part']),
             'coupon-part-lengths': parseInt(req.body['c-partlen']),
             'coupon-act': parseInt(req.body['act']),
             'coupon-actclient': (_.isUndefined(req.body['actclient'])) ? 0 : 1,
             'coupon-minprice': (req.body['minprice'] == '') ? 0 : parseFloat(req.body['minprice'].replace(",",".")).toFixed(2),
             'coupon-variants': parseInt(req.body['variants']),
             'coupon-type-discount': parseInt(req.body['typediscount']),
             'coupon-discount': parseFloat(req.body['discount'].replace(",",".")).toFixed(2),
             'coupon-until': moment(req.body['until'], 'DD.MM.YYYY')
                             .format('DD.MM.YYYY')
           };
           var exist = {
             'coupon-number': -1,
             'coupon-parts': -1,
             'coupon-part-lengths': -1,
             'coupon-act': -1,
             'coupon-actclient': -1,
             'coupon-minprice': -1,
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
                        log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + err, 'error');
                        setImmediate(callback);
                      } else {
                        exist[s.property] = 1;
                        setImmediate(callback);
                      }
                    });
                  }, function(e) {
                       if (e) {
                         log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + e, 'error');
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
                                 log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + err, 'error');
                               } else {
                                 log('Магазин id=' + req.session.insalesid + ' Поля формы сохранены в базу приложения');
                               }
                             });
                           }
                         }
                         var T = new Tasks({
                           insalesid: req.session.insalesid,
                           type: 1,
                           status: 1,
                           numbers: form['coupon-number'],
                           parts: form['coupon-parts'],
                           length: form['coupon-part-lengths'],
                           act: form['coupon-act'],
                           actclient: form['coupon-actclient'],
                           minprice: form['coupon-minprice'],
                           variant: form['coupon-variants'],
                           typediscount: form['coupon-type-discount'],
                           discount: form['coupon-discount'],
                           until: form['coupon-until'],
                           count: 0,
                           created_at : new Date(),
                           updated_at : new Date()
                         });
                         T.save(function (err) {
                           if (err) {
                             log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + err, 'error');
                           } else {
                             res.json('success');
                           }
                         });
                       }
                     });
                });
           } else {
             res.send('ошибка');
           }
         } else {
           res.status(403).send('Приложение не установлено для данного магазина');
         }
       });
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
  }
})

router.get('/sample', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid:req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        var p = parseInt(req.query.parts);
        var l = parseInt(req.query.length);
        if ((p >= 1) && (p <= 5) && (l >= 4) && (l <= 10)) {
          res.json(cc.generate({ parts: p, partLen: l }));
        } else {
          res.json('ошибка запроса');
        }
      } else {
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    });
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
  }
})

router.get('/id', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid:req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        res.send('Ваш id: ' + req.session.insalesid);
      } else {
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    });
  } else {
    res.status(403).send('Сначала необходимо войти из панели администратора insales -> приложения -> установленные -> войти');
  }
})

router.get('/data', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid:req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        var data = [];
        Coupons.find({
          insalesid: req.session.insalesid
        }, function(err, coupons) {
             var i = 0;
             async.each(coupons, function(coup, callback) {
               var type_discount = ((coup.typeid == 1) ? ' %' : ' руб');
               var minprice = ((coup.minprice == null) ? ' ' : coup.minprice);
               var act = ((coup.act == 1) ? 'одноразовый' : 'многоразовый');
               var actclient = ((coup.act == 1) ? 'да' : 'нет');
               var expired = moment(new Date(coup.expired_at))
                             .format('DD-MM-YYYY');
               var worked = ' ';
               if ((coup.disabled == 0) && (coup.worked == 0)) {
                 worked = 'да';
               } else if ((coup.disabled == 0) && (coup.worked == 1)) {
                 worked = 'нет';
               }
               var disabled = ((coup.disabled == 1) ? 'да' : 'нет');
               data[i] = {
                 code: coup.code,
                 type: act,
                 typeid: coup.act,
                 coll: coup.discountcollections,
                 disc: coup.discount + type_discount,
                 expired: expired,
                 disabled: disabled,
                 worked: worked
               };
               i++;
               setImmediate(callback);
             }, function(e) {
                  if (e) {
                    log('Магазин id=' + req.session.insalesid + ' Ошибка: ' + e, 'error');
                    res.sendStatus(200);
                  } else {
                    res.json(data);
                  }
                });
           });
      } else {
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    });
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
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
            log('Магазин id=' + req.query.insales_id + ' Ошибка: ' + err, 'error');
            res.status(500).send({ error: err });
          } else {
            log('Магазин id=' + req.query.insales_id + ' Установлен');
            res.sendStatus(200);
            jobs.create('syncall', {
              id: req.query.insales_id
            }).delay(600).priority('normal').save();
            log('Магазин id=' + req.query.insales_id + ' После установки отправка задания в очередь на синхронизацию');
            // jobs.create('pay', {
            //   id: req.query.insales_id
            // }).delay(600).priority('normal').save();
            log('Магазин id=' + req.query.insales_id + ' После установки отправка задания в очередь на проверку оплаты');
            var msg = {
              message: "+1 установка",
              title: "Генератор купонов"
            };
            p.send(msg, function(err, result) {
              if (err) {
                log(err, 'error');
              } else {
                log(result);
              }
            });
          }
        });
      } else {
        if (a.enabled == true) {
          res.status(403).send('Приложение уже установленно');
        } else {
          a.token = crypto.createHash('md5')
                    .update(req.query.token + process.env.insalessecret)
                    .digest('hex');
          a.updated_at = moment().format('ddd, DD MMM YYYY HH:mm:ss ZZ');
          a.enabled = true;
          a.save(function (err) {
            if (err) {
              log('Магазин id=' + req.query.insales_id + ' Ошибка: ' + err, 'error');
              res.status(500).send({ error: err });
            } else {
              log('Магазин id=' + req.query.insales_id + ' Установлен');
              res.sendStatus(200);
              jobs.create('syncall', {
                id: a.insalesid
              }).delay(600).priority('normal').save();
              log('Магазин id=' + req.query.insales_id + ' После установки отправка задания в очередь на синхронизацию');
              // jobs.create('pay', {
              //   id: a.insalesid
              // }).delay(600).priority('normal').save();
              log('Магазин id=' + req.query.insales_id + ' После установки отправка задания в очередь на проверку оплаты');
              var msg = {
                message: "+1 установка",
                title: "Генератор купонов"
              };
              p.send(msg, function(err, result) {
                if (err) {
                  log(err, 'error');
                } else {
                  log(result);
                }
              });
            }
          });
        }
      }
    });
  } else {
    res.status(403).send('Ошибка установки приложения');
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
            log('Магазин id=' + req.query.insales_id + ' Ошибка: ' + err, 'error');
            res.status(500).send({ error: err });
          } else {
            log('Магазин id=' + req.query.insales_id + ' Удалён');
            res.sendStatus(200);
          }
        });
      } else {
        res.status(403).send('Ошибка удаления приложения');
      }
    });
  } else {
    res.status(403).send('Ошибка удаления приложения');
  }
});

module.exports = router;

mongoose.connect('mongodb://' + process.env.mongo + '/coupons');

var Apps = require('../models').Apps;
var Tasks = require('../models').Task;
var Settings = require('../models').Sett;
var Charges = require('../models').Chrg;
var Coupons = require('../models').Coup;
