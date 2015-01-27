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
    fs          = require('fs'),
    moment      = require('moment'),
    hat         = require('hat'),
    rack        = hat.rack(),
    Agenda      = require('agenda'),
    async       = require('async'),
    cc          = require('coupon-code'),
    _           = require('lodash'),
    array       = require('array'),
    xl          = require('excel4node'),
    XLSX        = require('xlsx'),
    winston     = require('winston'),
    formidable  = require('formidable'),
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

var agenda = new Agenda({
  db: {
    address: process.env.mongo + '/coupons'
  }
});

jobs.promote(610,1);

router.get('/', function(req, res) {
  if (req.query.token && (req.query.token !== '')) {
    Apps.findOne({autologin:req.query.token}, function(err, a) {
      if (a) {
        log('Магазин id=' + a.insalesid + ' Создаём сессию и перебрасываем на главную');
        req.session.insalesid = a.insalesid;
        res.redirect('/');
      } else {
        log('Ошибка автологина. Неправильный token при переходе из insales', 'warn');
        res.status(403).send('Ошибка автологина');
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
                setImmediate(callback);
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
                              + '&login=https://coupons.salesapps.ru');
                }
              });
            }
          });
        } else {
          res.status(403).send('Приложение не установлено для данного магазина');
        }
      });
    } else {
      res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
    }
  }
});

router.get('/zadaniya', function(req, res) {
  if (req.session.insalesid) {
    Apps.findOne({insalesid: req.session.insalesid}, function(err, app) {
      if (app.enabled == true) {
        var T = Tasks.find({insalesid: req.session.insalesid});
        T.sort({created_at: -1});
        T.limit(50);
        T.exec(function(err, tasks) {
          var tasksList = [];
          var tasksDone = [];
          var tasksProcessing = [];
          async.each(tasks, function(task, callback) {
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
                 title      : '',
                 _          : _,
                 tasks      : tasksList,
                 done       : tasksDone,
                 processing : tasksProcessing
               });
             });
        });
      } else {
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    })
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
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
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    })
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
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
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    })
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
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

function isEven(n) {
  return n === parseFloat(n)? !(n%2) : void 0;
}

function rowStyle(wb, odd, middle, header) {
  var color = ((odd) ? 'E9E7E3' : 'FFFFFF');
  var row = this;
  row = wb.Style();
  if (header) {
    row.Font.Family('Arial');
    row.Font.Size(12);
    row.Font.WrapText(true);
    row.Font.Alignment.Vertical('center');
    row.Font.Alignment.Horizontal('center');
    row.Border({
      top:{
        style:'thick'
      },
      bottom:{
        style:'thick'
      },
      left:{
        style:'thick'
      },
      right:{
        style:'thick'
      }
    });
  } else {
    row.Font.Family('Arial');
    row.Font.Size(12);
    row.Font.WrapText(true);
    row.Fill.Pattern('solid');
    row.Fill.Color(color);
    row.Font.Alignment.Vertical('center');
    if (middle) {
      row.Font.Alignment.Horizontal('center');
    }
    row.Border({
      bottom:{
        style:'thin',
        color:'A0A0A4'
      }
    });
  }
  return row;
}

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
        res.render('desc', {
          title    : ''
        });
      } else {
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    })
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
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
                                 log('Ok');
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
                           group: form['coupon-group'],
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

// создаём задания на проверку оплаты приложения
agenda.define('check pay', function(job, done) {
  Apps.find({enabled: true}, function(err, apps) {
    async.each(apps, function(a, callback) {
      jobs.create('checkpay', {
        id: a.insalesid,
        token: a.token,
        insalesurl: a.insalesurl
      }).delay(600).priority('normal').save();
      setImmediate(callback);
    }, function(e) {
         if (e) {
           log('Ошибка: ' + e, 'error');
           setImmediate(done);
         } else {
           log('Созданы задания на проверку платежей');
           setImmediate(done);
         }
       });
  });
});

agenda.every('00 05 * * *', 'check pay');
agenda.start();

// проверка на новые задания
setInterval(function() {
  Tasks.aggregate([ {
    $match: {
      status: { $in : [1, 2] }
    }
  }, {
    $sort : { created_at: 1 }
  }, {
    $group: {
      _id: { insalesid: "$insalesid" },
      id: { $first: "$_id" }
    }
  }], function(err, result) {
       if (err) {
         log('Ошибка: ' + err, 'error');
       } else {
         for (var i = 0; i < result.length; i++) {
           Tasks.findById(result[i].id, function (err, task) {
             if (task.status == 1) {
               var j = {};
               if ((task.type == 5) || (task.type == 8)) {
                 j = {
                   data: {
                     id: task.insalesid,
                     taskid: task._id,
                     type: task.type,
                     path: null,
                     numbers: null,
                     parts: null,
                     length: null,
                     act: null,
                     actclient: null,
                     minprice: null,
                     variant: null,
                     typediscount: null,
                     discount: null,
                     until: null,
                     group: null
                   }
                 };
               } else if (task.type == 6) {
                 j = {
                   data: {
                     id: task.insalesid,
                     taskid: task._id,
                     type: task.type,
                     path: null,
                     numbers: null,
                     parts: null,
                     length: null,
                     act: null,
                     actclient: null,
                     minprice: null,
                     variant: task.variant,
                     typediscount: null,
                     discount: null,
                     until: null,
                     group: null
                   }
                 };
               } else if (task.type == 7) {
                 j = {
                   data: {
                     id: task.insalesid,
                     taskid: task._id,
                     type: task.type,
                     path: task.path,
                     numbers: null,
                     parts: null,
                     length: null,
                     act: null,
                     actclient: null,
                     minprice: null,
                     variant: null,
                     typediscount: null,
                     discount: null,
                     until: null,
                     group: null
                   }
                 };
               } else {
                 j = {
                   data: {
                     id: task.insalesid,
                     taskid: task._id,
                     type: task.type,
                     path: null,
                     numbers: task.numbers,
                     parts: task.parts,
                     length: task.length,
                     act: task.act,
                     actclient: task.actclient,
                     minprice: task.minprice,
                     variant: task.variant,
                     typediscount: task.typediscount,
                     discount: task.discount,
                     until: task.until,
                     group: task.group
                   }
                 };
               }
               Queue.createJobDeleteCouponsFromApp(j);
               task.status = 2;
               task.count = 1;
               task.updated_at = new Date();
               task.save(function (err) {
                 if (err) {
                   log('Магазин id=' + task.insalesid + ' Ошибка: ' + err, 'error');
                 } else {
                   log('Магазин id=' + task.insalesid + ' Задание ушло на выволнение');
                 }
               });
             } else if (task.status == 2) {
               if (task.count == 3) {
                 task.status = 3;
                 task.message = 'произошла ошибка';
                 task.updated_at = new Date();
                 task.save(function (err) {
                   if (err) {
                     log('Магазин id=' + task.insalesid + ' Ошибка: ' + err, 'error');
                   } else {
                     log('Магазин id=' + task.insalesid + ' Задание закрыто, из-за лимита попыток');
                   }
                 });
               } else {
                 var hours = Math.abs(new Date() - new Date(task.updated_at)) / 36e5;
                 if (hours > 4) {
                   task.status = 1;
                   task.count++;
                   task.updated_at = new Date();
                   task.save(function (err) {
                   if (err) {
                     log('Магазин id=' + task.insalesid + ' Ошибка: ' + err, 'error');
                   } else {
                     log('Магазин id=' + task.insalesid + ' Перезапуск задания, попытка: ' + task.count);
                   }
                 });
                 }
               }
             }
           })
         }
       }
     });
}, 5000 );

// 1 удалить все купоны, создать новые
// 2 создать новые, добавив к текущим
// 3 удалить использованные, создать новые
// 4 удалить неиспользованные, создать новые
var Queue = {
  createJobDeleteCouponsFromApp: function(job) {
    jobs.create('deleteApp', {
      id: job.data.id,
      taskid: job.data.taskid,
      type: job.data.type,
      path: job.data.path,
      numbers: job.data.numbers,
      parts: job.data.parts,
      length: job.data.length,
      act: job.data.act,
      actclient: job.data.actclient,
      minprice: job.data.minprice,
      variant: job.data.variant,
      typediscount: job.data.typediscount,
      discount: job.data.discount,
      until: job.data.until,
      group: job.data.group
    }).priority('normal').save();
  },

  deleteCouponsFromApp: function(job, done) {
    Coupons.remove({insalesid: job.data.id}, function(err, coupon) {
      if (err) {
        log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
        Queue.createJobDeleteCouponsFromApp(job);
        setImmediate(done);
      } else {
        log('Удалены купоны из базы приложения');
        Queue.createJobDeleteCollectionsFromApp(job);
        setImmediate(done);
      }
    });
  },

  createJobDeleteCollectionsFromApp: function(job) {
    jobs.create('deleteCollections', {
      id: job.data.id,
      taskid: job.data.taskid,
      type: job.data.type,
      path: job.data.path,
      numbers: job.data.numbers,
      parts: job.data.parts,
      length: job.data.length,
      act: job.data.act,
      actclient: job.data.actclient,
      minprice: job.data.minprice,
      variant: job.data.variant,
      typediscount: job.data.typediscount,
      discount: job.data.discount,
      until: job.data.until,
      group: job.data.group
    }).priority('normal').save();
  },

  deleteCollectionsFromApp: function(job, done) {
    Collections.remove({insalesid:job.data.id}, function(err, collection) {
      if (err) {
        log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
        Queue.createJobDeleteCollectionsFromApp(job);
        setImmediate(done);
      } else {
        log('Удалены категории из базы приложения');
        Queue.createJobGetCollections(job);
        setImmediate(done);
      }
    });
  },

  createJobGetCollections: function(job) {
    var p = (job.data.page === undefined) ? 1 : job.data.page;
    log('Задание на получение категорий');
    jobs.create('getCollections', {
      id: job.data.id,
      taskid: job.data.taskid,
      page: p,
      type: job.data.type,
      path: job.data.path,
      numbers: job.data.numbers,
      parts: job.data.parts,
      length: job.data.length,
      act: job.data.act,
      actclient: job.data.actclient,
      minprice: job.data.minprice,
      variant: job.data.variant,
      typediscount: job.data.typediscount,
      discount: job.data.discount,
      until: job.data.until,
      group: job.data.group
    }).delay(600).priority('normal').save();
  },

  getCollections: function(job, done) {
    Apps.findOne({insalesid: job.data.id}, function(err, app) {
      if (app.enabled == true) {
        rest.get('http://' + process.env.insalesid
                + ':'
                + app.token
                + '@'
                + app.insalesurl
                + '/admin/collections.xml', {
                  headers: {'Content-Type': 'application/xml'}
                }).once('complete', function(o) {
          if (o instanceof Error) {
            log('Магазин id=' + job.data.id + ' Ошибка: ' + o.message, 'error');
            this.retry(5000);
          } else {
            if (o.errors) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
              setImmediate(done);
            } else {
              log('Заходим в функцию дёрганья категорий');
              if (_.isUndefined(o['collections']['collection'][0])) {
                var coll = o['collections']['collection'];
                var collection = new Collections({
                  insalesid           : job.data.id,
                  colid               : coll['id'],
                  parentid            : coll['parent-id'],
                  name                : coll['title'],
                  created_at          : coll['created-at'],
                  updated_at          : coll['updated-at']
                });
                collection.save(function (err) {
                  if (err) {
                    log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                    setImmediate(done);
                  } else {
                    log('Сохранёна категория из магазина в базу приложения');
                    Queue.createJobGetCoupons(job);
                    setImmediate(done);
                  }
                });
              } else {
                async.each(o['collections']['collection'], function(coll, callback) {
                  var collection = new Collections({
                    insalesid           : job.data.id,
                    colid               : coll['id'],
                    parentid            : coll['parent-id'],
                    name                : coll['title'],
                    created_at          : coll['created-at'],
                    updated_at          : coll['updated-at']
                  });
                  collection.save(function (err) {
                    if (err) {
                      log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                      setImmediate(callback);
                    } else {
                      log('Сохранена категория из магазина в базу приложения');
                      setImmediate(callback);
                    }
                  });
                }, function(e) {
                     if (e) {
                       log('Магазин id=' + job.data.id + ' Ошибка: ' + e, 'error');
                       Queue.createJobGetCollections(job);
                       setImmediate(done);
                     } else {
                       log('All collections');
                       Queue.createJobGetCoupons(job);
                       setImmediate(done);
                     }
                   });
              }
            }
          }
        });
      } else {
        log('Приложение не установлено для данного магазина');
        setImmediate(done);
      }
    });
  },

  createJobGetCoupons: function(job) {
    var p = (job.data.page === undefined) ? 1 : job.data.page;
    log('Задание на получение купонов');
    jobs.create('get', {
      id: job.data.id,
      taskid: job.data.taskid,
      page: p,
      type: job.data.type,
      path: job.data.path,
      numbers: job.data.numbers,
      parts: job.data.parts,
      length: job.data.length,
      act: job.data.act,
      actclient: job.data.actclient,
      minprice: job.data.minprice,
      variant: job.data.variant,
      typediscount: job.data.typediscount,
      discount: job.data.discount,
      until: job.data.until,
      group: job.data.group
    }).delay(600).priority('normal').save();
  },

  getCouponsFromShop: function(job, done) {
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
            log('Магазин id=' + job.data.id + ' Ошибка: ' + o.message, 'error');
            this.retry(5000);
          } else {
            if (o.errors) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
              setImmediate(done);
            } else {
              log('Заходим в функцию дёрганья купонов');
              if (typeof o['discount-codes'] === 'undefined') {
                if ((job.data.variant === 1) ||
                    (job.data.variant === 3) ||
                    (job.data.variant === 4)) {
                  Queue.createJobDeleteCoupons(job);
                  setImmediate(done);
                } else if (job.data.variant === 2) {
                  Queue.createJobCreateCoupons(job);
                  setImmediate(done);
                } else if (job.data.type === 7) {
                  Queue.createJobParseXLSX(job);
                  setImmediate(done);
                } else if (job.data.type === 8) {
                  Queue.createExportFile(job);
                  setImmediate(done);
                } else {
                  log('Конец');
                  Queue.createJobCloseTask(job.data.taskid);
                  setImmediate(done);
                }
              } else {
                if (_.isUndefined(o['discount-codes']['discount-code'][0])) {
                  var coup = o['discount-codes']['discount-code'];
                  var collection = _.map(coup['discount-collections']['discount-collection'], 'collection-id').join(',');
                  if (!_.isEmpty(collection)) {
                      var arr = [];
                      var C = Collections.find({insalesid:job.data.id});
                      C.find({'colid': {$in:collection}});
                      C.exec(function(err, collec) {
                        if (err) {
                          log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                          setImmediate(done);
                        } else {
                          for (var i = 0, len = collec.length; i < len; i++) {
                            arr.push(collec[i].name);
                          }
                          var coupon = new Coupons({
                            insalesid           : job.data.id,
                            guid                : coup['id'],
                            code                : coup['code'],
                            description         : coup['description'],
                            act                 : coup['act-once'],
                            actclient           : coup['act-once-for-client'],
                            typeid              : coup['type-id'],
                            discount            : coup['discount'],
                            minprice            : coup['min-price'],
                            worked              : coup['worked'],
                            discountcollections : arr.join(',').replace( /,/g,',\n'),
                            collections_id      : collection,
                            expired_at          : coup['expired-at'],
                            created_at          : coup['created-at'],
                            updated_at          : coup['updated-at'],
                            disabled            : coup['disabled']
                          });
                          coupon.save(function (err) {
                            if (err) {
                              log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                              setImmediate(done);
                            } else {
                              log('Сохранён купон из магазина в базу приложения');
                              job.data.page++;
                              Queue.createJobGetCoupons(job);
                              setImmediate(done);
                            }
                          });
                        }
                      });
                  } else {
                    var coupon = new Coupons({
                      insalesid           : job.data.id,
                      guid                : coup['id'],
                      code                : coup['code'],
                      description         : coup['description'],
                      act                 : coup['act-once'],
                      actclient           : coup['act-once-for-client'],
                      typeid              : coup['type-id'],
                      discount            : coup['discount'],
                      minprice            : coup['min-price'],
                      worked              : coup['worked'],
                      discountcollections : 'Все',
                      collections_id      : '',
                      expired_at          : coup['expired-at'],
                      created_at          : coup['created-at'],
                      updated_at          : coup['updated-at'],
                      disabled            : coup['disabled']
                    });
                    coupon.save(function (err) {
                      if (err) {
                        log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                        setImmediate(done);
                      } else {
                        log('Сохранён купон из магазина в базу приложения');
                        job.data.page++;
                        Queue.createJobGetCoupons(job);
                        setImmediate(done);
                      }
                    });
                  }
                } else {
                  log('Здесь');
                  async.each(o['discount-codes']['discount-code'], function(coup, callback) {
                    var collection = _.map(coup['discount-collections']['discount-collection'], 'collection-id');
                    if (!_.isEmpty(collection)) {
                      var arr = [];
                      var C = Collections.find({insalesid:job.data.id});
                      C.find({'colid': {$in:collection}});
                      C.exec(function(err, collec) {
                        if (err) {
                          log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                          setImmediate(callback);
                        } else {
                          for (var i = 0, len = collec.length; i < len; i++) {
                            arr.push(collec[i].name);
                          }
                          var coupon = new Coupons({
                            insalesid           : job.data.id,
                            guid                : coup['id'],
                            code                : coup['code'],
                            description         : coup['description'],
                            act                 : coup['act-once'],
                            actclient           : coup['act-once-for-client'],
                            typeid              : coup['type-id'],
                            discount            : coup['discount'],
                            minprice            : coup['min-price'],
                            worked              : coup['worked'],
                            discountcollections : arr.join(',').replace( /,/g,',\n'),
                            collections_id      : collection.join(','),
                            expired_at          : coup['expired-at'],
                            created_at          : coup['created-at'],
                            updated_at          : coup['updated-at'],
                            disabled            : coup['disabled']
                          });
                          coupon.save(function (err) {
                            if (err) {
                              log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                              setImmediate(callback);
                            } else {
                              log('Сохранён купон из магазина в базу приложения');
                              setImmediate(callback);
                            }
                          });
                        }
                      });
                    } else {
                      var coupon = new Coupons({
                        insalesid           : job.data.id,
                        guid                : coup['id'],
                        code                : coup['code'],
                        description         : coup['description'],
                        act                 : coup['act-once'],
                        actclient           : coup['act-once-for-client'],
                        typeid              : coup['type-id'],
                        discount            : coup['discount'],
                        minprice            : coup['min-price'],
                        worked              : coup['worked'],
                        discountcollections : 'Все',
                        collections_id      : '',
                        expired_at          : coup['expired-at'],
                        created_at          : coup['created-at'],
                        updated_at          : coup['updated-at'],
                        disabled            : coup['disabled']
                      });
                      coupon.save(function (err) {
                        if (err) {
                          log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                          setImmediate(callback);
                        } else {
                          log('Сохранён купон из магазина в базу приложения');
                          setImmediate(callback);
                        }
                      });
                    }
                  }, function(e) {
                       if (e) {
                         log('Магазин id=' + job.data.id + ' Ошибка: ' + e, 'error');
                         Queue.createJobGetCoupons(job);
                         setImmediate(done);
                       } else {
                         log('All coupons have been processed successfully ' + job.data.page);
                         job.data.page++;
                         Queue.createJobGetCoupons(job);
                         setImmediate(done);
                       }
                     });
                }
              }
            }
          }
        });
      } else {
        log('Приложение не установлено для данного магазина');
        setImmediate(done);
      }
    });
  },

  createJobDeleteCoupons: function(job) {
    var C = Coupons.find({insalesid: job.data.id});
    if (job.data.variant == 3) {
      C.and([{'worked': false}, {'disabled': false}]);
    } else if (job.data.variant == 4) {
      C.and([{'worked': true}, {'disabled': false}]);
    }
    C.exec(function(err, coupons) {
      async.each(coupons, function(coup, callback) {
        jobs.create('deleteInsales', {
          id: job.data.id,
          taskid: job.data.taskid,
          couponid: coup.guid,
          type: job.data.type,
          numbers: job.data.numbers,
          parts: job.data.parts,
          length: job.data.length,
          act: job.data.act,
          actclient: job.data.actclient,
          minprice: job.data.minprice,
          variant: job.data.variant,
          typediscount: job.data.typediscount,
          discount: job.data.discount,
          until: job.data.until
        }).delay(600).priority('normal').save();
        setImmediate(callback);
      }, function(e) {
           if (e) {
             log('Магазин id=' + job.data.id + ' Ошибка: ' + e, 'error');
           } else {
             log('Задание на удаление создано');
             jobs.create('deleteInsales', {
               id: job.data.id,
               taskid: job.data.taskid,
               type: job.data.type,
               numbers: job.data.numbers,
               parts: job.data.parts,
               length: job.data.length,
               act: job.data.act,
               actclient: job.data.actclient,
               minprice: job.data.minprice,
               variant: job.data.variant,
               typediscount: job.data.typediscount,
               discount: job.data.discount,
               until: job.data.until
             }).delay(600).priority('normal').save();
           }
         });
    });
  },

  deleteCoupons: function(job, done) {
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
            log('Магазин id=' + job.data.id + ' Ошибка: ' + JSON.stringify(o), 'error');
            var re = new RegExp(job.data.couponid,"g");
            if (o.errors.error.match(re)) {
              Coupons.findOneAndRemove({
                guid: job.data.couponid
              }, function (err, r){
                   if (err) {
                     log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                     setImmediate(done);
                   } else {
                     log('Удалён купон из магазина и базы приложения');
                     setImmediate(done);
                   }
                 });
            }
          } else {
            Coupons.findOneAndRemove({
              guid: job.data.couponid
            }, function (err, r){
                 if (err) {
                   log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                   setImmediate(done);
                 } else {
                   log('Удалён купон из магазина и базы приложения');
                   setImmediate(done);
                 }
               });
          }
        });
      } else {
        log('Приложение не установлено для данного магазина', 'warn');
        setImmediate(done);
      }
    });
  },

  createJobParseXLSX: function(job) {
    var iter = 1;
    var error = 0;
    var workbook = XLSX.readFile(job.data.path);
    var sheet = XLSX.utils.sheet_to_row_object_array(workbook.Sheets['Купоны']);
    async.each(sheet, function(row, callback) {
      if (error == 0) {
        iter++;
        if (_.isUndefined(row['Код купона'])) {
          var message = 'Ошибка в ячейке A' + iter;
          error = 1;
          Queue.createJobCloseTask(job.data.taskid, message);
          setImmediate(callback);
        } else if (_.isUndefined(row['Тип купона'])) {
          var message = 'Ошибка в ячейке B' + iter;
          error = 1;
          Queue.createJobCloseTask(job.data.taskid, message);
          setImmediate(callback);
        } else if (_.isUndefined(row['Тип скидки'])) {
          var message = 'Ошибка в ячейке C' + iter;
          error = 1;
          Queue.createJobCloseTask(job.data.taskid, message);
          setImmediate(callback);
        } else if (_.isUndefined(row['Величина скидки'])) {
          var message = 'Ошибка в ячейке D' + iter;
          error = 1;
          Queue.createJobCloseTask(job.data.taskid, message);
          setImmediate(callback);
        } else if (_.isUndefined(row['Один раз для каждого клиента'])) {
          var message = 'Ошибка в ячейке H' + iter;
          error = 1;
          Queue.createJobCloseTask(job.data.taskid, message);
          setImmediate(callback);
        } else if (_.isUndefined(row['Заблокирован'])) {
          var message = 'Ошибка в ячейке J' + iter;
          error = 1;
          Queue.createJobCloseTask(job.data.taskid, message);
          setImmediate(callback);
        } else {
          var C = Coupons.find({insalesid:job.data.id});
          C.find({code:row['Код купона']});
          C.exec(function(err, coupon) {
            if (err) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
              setImmediate(callback);
            } else {
              var type_discount = '';
              var minprice = '';
              var act = '';
              var actclient = '';
              var disabled = '';
              if (row['Тип скидки'] == 'процент') {
                type_discount = 1;
              } else if (row['Тип скидки'] == 'денежная величина') {
                type_discount = 2;
              }
              if (row['Тип купона'] == 'одноразовый') {
                act = true;
              } else if (row['Тип купона'] == 'многоразовый') {
                act = false;
              }
              if (row['Заблокирован'] == 'да') {
                disabled = true;
              } else if (row['Заблокирован'] == 'нет') {
                disabled = false;
              }
              if (row['Один раз для каждого клиента'] == 'да') {
                actclient = true;
              } else if (row['Один раз для каждого клиента'] == 'нет') {
                actclient = false;
              }
              if (_.isNumber(row['Минимальная сумма заказа'])) {
                minprice = parseFloat(row['Минимальная сумма заказа'].replace(",",".")).toFixed(2);
              } else {
                minprice = null;
              }
              if (_.isUndefined(coupon[0])) {
                jobs.create('create', {
                  id: job.data.id,
                  taskid: job.data.taskid,
                  type: 2,
                  coupon: row['Код купона'],
                  desc: row['Описание'],
                  act: act,
                  actclient: actclient,
                  minprice: minprice,
                  discount: row['Величина скидки'].toFixed(2),
                  typediscount: type_discount,
                  until: row['Действителен по'],
                  disabled: disabled
                }).delay(600).priority('normal').save();
                setImmediate(callback);
              } else {
                var objectDB = {
                  id: job.data.id,
                  taskid: job.data.taskid,
                  guid: coupon[0].guid,
                  type: 2,
                  coupon: coupon[0].code,
                  act: coupon[0].act,
                  actclient: coupon[0].actclient,
                  minprice: coupon[0].minprice,
                  discount: parseFloat(coupon[0].discount).toFixed(2),
                  typediscount: coupon[0].typeid,
                  until: moment(coupon[0].expired_at)
                         .format('DD-MM-YYYY'),
                  disabled: coupon[0].disabled
                };
                var objectXLSX = {
                  id: job.data.id,
                  taskid: job.data.taskid,
                  guid: coupon[0].guid,
                  type: 2,
                  coupon: row['Код купона'],
                  act: act,
                  actclient: actclient,
                  minprice: minprice,
                  discount: parseFloat(row['Величина скидки']).toFixed(2),
                  typediscount: type_discount,
                  until: row['Действителен по'],
                  disabled: disabled
                };
                if (!_.isEqual(objectDB, objectXLSX)) {
                  log(row['Код купона'] + ' изменён');
                  log(objectDB);
                  log(objectXLSX);
                  jobs.create('update', objectXLSX).delay(600).priority('normal').save();
                  setImmediate(callback);
                } else {
                  log('Купон такой же');
                  setImmediate(callback);
                }
              }
            }
          });
        }
      } else {
        setImmediate(callback);
      }
    }, function(e) {
         if (e) {
           log('Магазин id=' + job.data.id + ' Ошибка: ' + e, 'error');
           Queue.createJobParseXLSX(job);
         } else {
           log('All coupons have been processed successfully');
           Queue.createJobCloseTask(job.data.taskid);
         }
       });
  },

  updateCoupon: function(job, done) {
    Apps.findOne({insalesid:job.data.id}, function(err, app) {
      if (app.enabled == true) {
        var desc = (_.isUndefined(job.data.desc) ? 'генератор купонов' : job.data.desc);
        var disb = (_.isUndefined(job.data.disabled) ? false : job.data.disabled);
        var minprice = (_.isUndefined(job.data.minprice) || (job.data.minprice == 0) || (_.isNull(job.data.minprice))) ? '' : '<min-price>' + job.data.minprice + '</min-price>';
        var actclient = (_.isUndefined(job.data.actclient) || (job.data.actclient == '')) ? '<act_once_for_client>0</act_once_for_client>' : '<act_once_for_client>1</act_once_for_client>';
        var coupon = '<?xml version=\"1.0\" encoding=\"UTF-8\"?>'
                   + '<discount_code>'
                   + '<code>' + job.data.coupon + '</code>'
                   + '<act_once>' + job.data.act + '</act_once>'
                   + minprice
                   + actclient
                   + '<discount>' + job.data.discount + '</discount>'
                   + '<type_id>' + job.data.typediscount + '</type_id>'
                   + '<description>' + desc + '</description>'
                   + '<disabled>' + disb + '</disabled>'
                   + '<expired-at>' + moment(job.data.until, 'DD.MM.YYYY')
                                      .format('YYYY-MM-DD') + '</expired-at>'
                   + '</discount_code>';
        rest.put('http://' + process.env.insalesid + ':'
                + app.token + '@'
                + app.insalesurl
                + '/admin/discount_codes/'
                + job.data.guid
                + '.xml', {
                  data: coupon,
                  headers: {'Content-Type': 'application/xml'}
                }).once('complete', function(o) {
          if (o instanceof Error) {
            log('Магазин id=' + job.data.id + ' Ошибка: ' + o.message, 'error');
            this.retry(5000);
          } else {
            if (o.errors) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
              setImmediate(done);
            } else {
              log(o);
              Coupons.findOne({guid:job.data.guid}, function(err, coupon) {
                if (err) {
                  log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                  setImmediate(done);
                } else {
                  coupon.code        = o['discount-code']['code'];
                  coupon.description = o['discount-code']['description'];
                  coupon.act         = o['discount-code']['act-once'];
                  coupon.actclient   = o['discount-code']['act-once-for-client'];
                  coupon.typeid      = o['discount-code']['type-id'];
                  coupon.discount    = o['discount-code']['discount'];
                  coupon.minprice    = o['discount-code']['min-price'];
                  coupon.worked      = o['discount-code']['worked'];
                  coupon.expired_at  = o['discount-code']['expired-at'];
                  coupon.created_at  = o['discount-code']['created-at'];
                  coupon.updated_at  = o['discount-code']['updated-at'];
                  coupon.disabled    = o['discount-code']['disabled'];
                  coupon.save(function (err) {
                    if (err) {
                      log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                      setImmediate(done);
                    } else {
                      log('Обновлён купон');
                      setImmediate(done);
                    }
                  });
                }
              });
            }
          }
        });
      } else {
        log('Приложение не установлено для данного магазина');
        setImmediate(done);
      }
    });
  },

  createJobCreateCoupons: function(job) {
    var count = 0;
    async.whilst(
      function() { return count < job.data.numbers; },
      function(callback) {
        count++;
        jobs.create('create', {
          id: job.data.id,
          taskid: job.data.taskid,
          type: 2,
          coupon: cc.generate({ parts: job.data.parts, partLen: job.data.length }),
          act: job.data.act,
          actclient: job.data.actclient,
          minprice: job.data.minprice,
          discount: job.data.discount,
          typediscount: job.data.typediscount,
          until: job.data.until
        }).delay(600).priority('normal').save();
        setImmediate(callback);
      },
      function(err) {
        // TODO ошибку словить
        jobs.create('create', {
          taskid: job.data.taskid
        }).delay(600).priority('normal').save();
      }
    );
  },

  createCoupons: function(job, done) {
    Apps.findOne({insalesid:job.data.id}, function(err, app) {
      if (app.enabled == true) {
        var desc = (_.isUndefined(job.data.desc) ? 'генератор купонов' : job.data.desc);
        var disb = (_.isUndefined(job.data.disabled) ? false : job.data.disabled);
        var minprice = (_.isUndefined(job.data.minprice) || (job.data.minprice == 0) || (_.isNull(job.data.minprice))) ? '' : '<min-price>' + job.data.minprice + '</min-price>';
        var actclient = (_.isUndefined(job.data.actclient) || (job.data.actclient == '')) ? '<act_once_for_client>0</act_once_for_client>' : '<act_once_for_client>1</act_once_for_client>';
        var coupon = '<?xml version=\"1.0\" encoding=\"UTF-8\"?>'
                   + '<discount_code>'
                   + '<code>' + job.data.coupon + '</code>'
                   + '<act_once>' + job.data.act + '</act_once>'
                   + minprice
                   + actclient
                   + '<discount>' + job.data.discount + '</discount>'
                   + '<type_id>' + job.data.typediscount + '</type_id>'
                   + '<description>' + desc + '</description>'
                   + '<disabled>' + disb + '</disabled>'
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
            log('Магазин id=' + job.data.id + ' Ошибка: ' + o.message, 'error');
            this.retry(5000);
          } else {
            if (o.errors) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
              setImmediate(done);
            } else {
              log(_.isEmpty(o));
              var coupon = new Coupons({
                insalesid           : job.data.id,
                guid                : o['discount-code']['id'],
                code                : o['discount-code']['code'],
                description         : o['discount-code']['description'],
                act                 : o['discount-code']['act-once'],
                actclient           : o['discount-code']['act-once-for-client'],
                typeid              : o['discount-code']['type-id'],
                discount            : o['discount-code']['discount'],
                minprice            : o['discount-code']['min-price'],
                worked              : o['discount-code']['worked'],
                discountcollections : 'Все',
                expired_at          : o['discount-code']['expired-at'],
                created_at          : o['discount-code']['created-at'],
                updated_at          : o['discount-code']['updated-at'],
                disabled            : o['discount-code']['disabled']
              });
              coupon.save(function (err) {
                if (err) {
                  log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                  setImmediate(done);
                } else {
                  log('Создан купон');
                  setImmediate(done);
                }
              });
            }
          }
        });
      } else {
        log('Приложение не установлено для данного магазина');
        setImmediate(done);
      }
    });
  },

  createExportFile: function(job) {
    Apps.findOne({insalesid: job.data.id}, function(err, app) {
      if (app.enabled == true) {
        var wb = new xl.WorkBook();
        var ws = wb.WorkSheet('Купоны');
        var headerStyle = new rowStyle(wb, true, false, true);
        var rowOddStyle = new rowStyle(wb, true, false, false);
        var rowOddStyleMiddle = new rowStyle(wb, true, true, false);
        var rowEvenStyle = new rowStyle(wb, false, false, false);
        var rowEvenStyleMiddle = new rowStyle(wb, false, true, false);
        ws.Row(1).Height(30);
        ws.Column(1).Width(30);
        ws.Column(2).Width(30);
        ws.Column(3).Width(30);
        ws.Column(4).Width(30);
        ws.Column(5).Width(30);
        ws.Column(6).Width(30);
        ws.Column(7).Width(30);
        ws.Column(8).Width(30);
        ws.Column(9).Width(30);
        ws.Column(10).Width(30);
        ws.Column(11).Width(30);
        ws.Cell(1,1).String('Код купона').Style(headerStyle);
        ws.Cell(1,2).String('Тип купона').Style(headerStyle);
        ws.Cell(1,3).String('Тип скидки').Style(headerStyle);
        ws.Cell(1,4).String('Величина скидки').Style(headerStyle);
        ws.Cell(1,5).String('Описание').Style(headerStyle);
        ws.Cell(1,6).String('Группа категорий').Style(headerStyle);
        ws.Cell(1,7).String('Минимальная сумма заказа').Style(headerStyle);
        ws.Cell(1,8).String('Один раз для каждого клиента').Style(headerStyle);
        ws.Cell(1,9).String('Действителен по').Style(headerStyle);
        ws.Cell(1,10).String('Заблокирован').Style(headerStyle);
        ws.Cell(1,11).String('Использован').Style(headerStyle);
        Coupons.find({
          insalesid: job.data.id
        }, function(err, coupons) {
             if (_.isEmpty(coupons)) {
               Queue.createJobCloseTask(job.data.taskid, 'Отсутствуют купоны в базе приложения');
             } else {
               var i = 2;
               async.each(coupons, function(coup, callback) {
                 var type_discount = ((coup.typeid == 1) ? 'процент' : 'денежная величина');
                 var minprice = ((coup.minprice == null) ? ' ' : coup.minprice);
                 var act = ((coup.act == 1) ? 'одноразовый' : 'многоразовый');
                 var actclient = ((coup.actclient == 1) ? 'да' : 'нет');
                 var expired = moment(new Date(coup.expired_at))
                               .format('DD-MM-YYYY');
                 var worked = ' ';
                 if ((coup.disabled == 0) && (coup.worked == 0)) {
                   worked = 'да';
                 } else if ((coup.disabled == 0) && (coup.worked == 1)) {
                   worked = 'нет';
                 }
                 var disabled = ((coup.disabled == 1) ? 'да' : 'нет');
                 ws.Row(i).Height(20);
                 ws.Cell(i,1)
                 .String(coup.code)
                 .Style((isEven(i)) ? rowEvenStyle : rowOddStyle);
                 ws.Cell(i,2)
                 .String(act)
                 .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
                 ws.Cell(i,3)
                 .String(type_discount)
                 .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
                 ws.Cell(i,4)
                 .Number(coup.discount)
                 .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
                 ws.Cell(i,5)
                 .String(coup.description)
                 .Style((isEven(i)) ? rowEvenStyle : rowOddStyle);
                 ws.Cell(i,6)
                 .String(coup.discountcollections)
                 .Style((isEven(i)) ? rowEvenStyle : rowOddStyle);
                 ws.Cell(i,7)
                 .String(minprice)
                 .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
                 ws.Cell(i,8)
                 .String(actclient)
                 .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
                 ws.Cell(i,9)
                 .String(expired)
                 .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
                 ws.Cell(i,10)
                 .String(disabled)
                 .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
                 ws.Cell(i,11)
                 .String(worked)
                 .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
                 i++;
                 setImmediate(callback);
               }, function(e) {
                    if (e) {
                      log('Магазин id=' + job.data.id + ' Ошибка: ' + e, 'error');
                    } else {
                      log('Записываем xlsx файл');
                      var path = __dirname + '/../files/' + job.data.id;
                      fs.exists(path, function(exists) {
                        if (exists) {
                          wb.write(path + '/coupons.xlsx', function(err) {
                            if (err) {
                              log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                            } else {
                              Queue.createJobCloseTask(job.data.taskid);
                            }
                          });
                        } else {
                          fs.mkdir(path, function(err) {
                            if (err) {
                              log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                            } else {
                              wb.write(path + '/coupons.xlsx', function(err) {
                                if (err) {
                                  log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                                } else {
                                  Queue.createJobCloseTask(job.data.taskid);
                                }
                              });
                            }
                          });
                        }
                      });
                    }
                  });
             }
           });
      } else {
        log('Приложение не установлено для данного магазина', 'warn');
      }
    })
  },

  pay: function(job, done) {
    Apps.findOne({insalesid:job.data.id}, function(err, app) {
      if (app.enabled == true) {
        var pay = '<?xml version=\"1.0\" encoding=\"UTF-8\"?>'
                + '<recurring-application-charge>'
                + '<monthly type=\"decimal\">300.0</monthly>'
                + '</recurring-application-charge>';
        rest.post('http://' + process.env.insalesid + ':'
                 + app.token + '@'
                 + app.insalesurl
                 + '/admin/recurring_application_charge.xml', {
                   data: pay,
                   headers: {'Content-Type': 'application/xml'}
                 }).once('complete', function(o) {
          if (o instanceof Error) {
            log('Магазин id=' + job.data.id + ' Ошибка: ' + o.message, 'error');
            this.retry(5000);
          } else {
            if (o.errors) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
              setImmediate(done);
            } else {
              var p = new Charges({
                insalesid  : job.data.id,
                guid       : o['recurring-application-charge']['id'],
                free       : 0,
                monthly    : o['recurring-application-charge']['monthly'],
                till       : o['recurring-application-charge']['paid-till'],
                created_at : o['recurring-application-charge']['created-at'],
                updated_at : o['recurring-application-charge']['updated-at'],
                blocked    : o['recurring-application-charge']['blocked']
              });
              p.save(function (err) {
                if (err) {
                  log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                } else {
                  log('Магазин id=' + job.data.id + ' Создан счёт');
                  setImmediate(done);
                }
              });
            }
          }
        });
      } else {
        log('Приложение не установлено для данного магазина', 'warn');
      }
    });
  },

  createJobCloseTask: function(taskid, message) {
    log('Создаём задание на зыкрытие');
    log(taskid);
    if (_.isUndefined(message)) {
      jobs.create('close', {
        taskid: taskid,
        message: undefined
      }).priority('normal').save();
    } else {
      jobs.create('close', {
        taskid: taskid,
        message: message
      }).priority('normal').save();
    }
  },

  closeTask: function(taskid, message, done) {
    log('Закрываем таск');
    Tasks.findById(taskid, function(err, task) {
      task.status = 3;
      task.updated_at = new Date();
      if (!_.isUndefined(message)) {
        task.message = message;
      }
      if ((_.isUndefined(message)) && (task.type == 8)) {
        task.file = 1;
      }
      task.save(function(err) {
        if (err) {
          log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
          Queue.createJobCloseTask(taskid, message);
          setImmediate(done);
        } else {
          log('Done');
          setImmediate(done);
        }
      });
    })
  }
}

jobs.process('deleteApp', function(job, done) {
  // удаляем купоны из базы приложения
  Queue.deleteCouponsFromApp(job, done);
});

jobs.process('deleteCollections', function(job, done) {
  // удаляем категорий из базы приложения
  Queue.deleteCollectionsFromApp(job, done);
});

jobs.process('getCollections', function(job, done) {
  // достаём категории из магазина
  Queue.getCollections(job, done);
});

jobs.process('deleteInsales', function(job, done) {
  // удаляем купоны из магазина
  if (job.data.couponid === undefined) {
    if (job.data.type == 6) {
      Queue.createJobCloseTask(job.data.taskid);
      setImmediate(done);
    } else {
      Queue.createJobCreateCoupons(job);
      setImmediate(done);
    }
  } else {
    Queue.deleteCoupons(job, done);
  }
});

jobs.process('get', function(job, done) {
  // достаём купоны из магазина
  Queue.getCouponsFromShop(job, done);
});

jobs.process('create', function(job, done) {
  // создаём купоны
  if (job.data.id === undefined) {
    Queue.createJobCloseTask(job.data.taskid);
    setImmediate(done);
  } else {
    Queue.createCoupons(job, done);
  }
});

jobs.process('close', function(job, done) {
  // создаём купоны
  Queue.closeTask(job.data.taskid, job.data.message, done);
});

jobs.process('sync', function(job) {
  // после установки первое задание на синхронизации
  var T = new Tasks({
    insalesid: job.data.id,
    type: 8,
    status: 1,
    file: 0,
    created_at : new Date(),
    updated_at : new Date()
  });
  T.save(function (err) {
    if (err) {
      log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
    } else {
      log('Магазин id=' + job.data.id + ' Создано задание на синхронизацию после установки');
    }
  });
});

jobs.process('pay', function(job, done) {
  // после установки выставить счёт
  Queue.pay(job, done);
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
            res.send(err, 500);
          } else {
            res.send(200);
            jobs.create('sync', {
              id: req.query.insales_id
            }).delay(600).priority('normal').save();
            jobs.create('pay', {
              id: req.query.insales_id
            }).delay(600).priority('normal').save();
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
              res.send(err, 500);
            } else {
              res.send(200);
              jobs.create('sync', {
                id: a.insalesid
              }).delay(600).priority('normal').save();
              jobs.create('pay', {
                id: a.insalesid
              }).delay(600).priority('normal').save();
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
            res.send(err, 500);
          } else {
            res.send(200);
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

var ChargesSchema = new Schema();

ChargesSchema.add({
  insalesid        : { type: Number, index: true }, // id магазина
  guid             : { type: Number, index: true }, // id списания
  free             : Number, // для себя, платит магазин за приложение или нет
  monthly          : String, // сумма
  till             : String, // заплачено до
  blocked          : Boolean, // заблочен за неуплату
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
  path         : String, // путь до файла во время импорта
  status       : Number, // статус задания
  message      : String, // сообщение об ошибке
  file         : Number, // тригер о готовности файла
  numbers      : Number, // количество купонов
  parts        : Number, // количество частей купона
  length       : Number, // длина части купона
  act          : Number, // одно или много-разовый купон
  actclient    : Number, // использовать один раз для зарегистрированного
  minprice     : Number, // минимальная сумма заказа
  variant      : Number, // варианты развития задания
  typediscount : Number, // процент или денежная единица
  discount     : String, // величина скидки
  until        : String, // срок действия купона
  group        : String, // название группы купона
  count        : Number, // количество повторных запусков задания
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
  code                : { type: String, index: true }, // код купона
  description         : String, // описание купона
  act                 : Boolean, // одноразовый или многоразовый купон
  actclient           : Boolean, // одноразовый для зарегистрированного покупателя
  typeid              : Number, // тип скидки
  discount            : String, // размер скидки
  minprice            : Number, // минимальная цена при которой купон не раборает
  worked              : Boolean, // использованный купон или нет
  discountcollections : String, // строка названий разделов
  collections_id      : String, // строка id разделов разделённых запятой
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
  if (!_.isUndefined(logType)) {
    logger.log(logType, logMsg);
  } else {
    logger.info(logMsg);
  }
};