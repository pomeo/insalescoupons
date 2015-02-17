require('strong-agent').profile();
var mongoose    = require('mongoose'),
    Schema      = mongoose.Schema,
    kue         = require('kue'),
    jobs        = kue.createQueue({
      prefix: 'q',
      disableSearch: true,
      redis: {
        host: process.env.redis
      }
    }),
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
    xl          = require('excel4node'),
    XLSX        = require('xlsx'),
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

var agenda = new Agenda({
  db: {
    address: process.env.mongo + '/coupons'
  }
});

jobs.promote(610,1);

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
        log('Магазин id=' + job.data.id + ' Удалены купоны из базы приложения');
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
        log('Магазин id=' + job.data.id + ' Удалены категории из базы приложения');
        Queue.createJobGetCollections(job);
        setImmediate(done);
      }
    });
  },

  createJobGetCollections: function(job) {
    var p = (job.data.page === undefined) ? 1 : job.data.page;
    log('Магазин id=' + job.data.id + ' Задание на получение категорий');
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
            setImmediate(done);
          } else {
            if (o.errors) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
              setImmediate(done);
            } else {
              log('Магазин id=' + job.data.id + ' Заходим в функцию дёрганья категорий');
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
                    log('Магазин id=' + job.data.id + ' Сохранена категория из магазина в базу приложения');
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
                      log('Магазин id=' + job.data.id + ' Сохранена категория из магазина в базу приложения');
                      setImmediate(callback);
                    }
                  });
                }, function(e) {
                     if (e) {
                       log('Магазин id=' + job.data.id + ' Ошибка: ' + e, 'error');
                       Queue.createJobGetCollections(job);
                       setImmediate(done);
                     } else {
                       log('Магазин id=' + job.data.id + ' Все категории скачены из insales');
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
    log('Магазин id=' + job.data.id + ' Задание на получение купонов');
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
            setImmediate(done);
          } else {
            if (o.errors) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
              setImmediate(done);
            } else {
              log('Магазин id=' + job.data.id + ' Заходим в функцию дёрганья купонов');
              if (typeof o['discount-codes'] === 'undefined') {
                if ((job.data.variant === 1) ||
                    (job.data.variant === 3) ||
                    (job.data.variant === 4)) {
                  log('Магазин id=' + job.data.id + ' Уходим на удаление купонов');
                  Queue.createJobDeleteCoupons(job);
                  setImmediate(done);
                } else if (job.data.variant === 2) {
                  log('Магазин id=' + job.data.id + ' Уходим на создание купонов');
                  Queue.createJobCreateCoupons(job);
                  setImmediate(done);
                } else if (job.data.type === 7) {
                  log('Магазин id=' + job.data.id + ' Уходим на импорт файла');
                  Queue.createJobParseXLSX(job);
                  setImmediate(done);
                } else if (job.data.type === 8) {
                  log('Магазин id=' + job.data.id + ' Уходим на экспорт файла');
                  Queue.createExportFile(job);
                  setImmediate(done);
                } else {
                  log('Магазин id=' + job.data.id + ' Уходим на закрывание задания');
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
                              log('Магазин id=' + job.data.id + ' Сохранён купон из магазина в базу приложения');
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
                        log('Магазин id=' + job.data.id + ' Сохранён купон из магазина в базу приложения');
                        job.data.page++;
                        Queue.createJobGetCoupons(job);
                        setImmediate(done);
                      }
                    });
                  }
                } else {
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
                              log('Магазин id=' + job.data.id + ' Сохранён купон из магазина в базу приложения');
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
                          log('Магазин id=' + job.data.id + ' Сохранён купон из магазина в базу приложения');
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
                         log('Магазин id=' + job.data.id + ' Получение купонов на странице ' + job.data.page + ' завершено');
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
             log('Магазин id=' + job.data.id + ' Задание на удаление создано');
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
                     log('Магазин id=' + job.data.id + ' Удалён купон из магазина и базы приложения');
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
                   log('Магазин id=' + job.data.id + ' Удалён купон из магазина и базы приложения');
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
                  log('Магазин id=' + job.data.id + ' Купон ' + row['Код купона'] + ' изменён');
                  jobs.create('update', objectXLSX).delay(600).priority('normal').save();
                  setImmediate(callback);
                } else {
                  log('Магазин id=' + job.data.id + ' В файле xlsx и базе приложения купоны одинаковые, игнорируем изменения');
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
           log('Магазин id=' + job.data.id + ' Импорт купонов завершён успешно');
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
            setImmediate(done);
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
                      log('Магазин id=' + job.data.id + ' Обновлён купон');
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
      }, function(err) {
           // TODO ошибку err словить
           Queue.createJobCloseTask(job.data.taskid);
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
            setImmediate(done);
          } else {
            if (o.errors) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
              setImmediate(done);
            } else {
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
                  log('Магазин id=' + job.data.id + ' Создан купон');
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
                      log('Магазин id=' + job.data.id + ' Записываем xlsx файл');
                      var path = __dirname + '/files/' + job.data.id;
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
                                  log('Магазин id=' + job.data.id + ' Файл успешно создан');
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
            setImmediate(done);
          } else {
            if (o.errors) {
              log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
              setImmediate(done);
            } else {
              Charges.findOne({insalesid: job.data.id}, function(err, charge) {
                if (_.isEmpty(charge)) {
                  var p = new Charges({
                    insalesid  : job.data.id,
                    guid       : o['recurring-application-charge']['id'],
                    monthly    : o['recurring-application-charge']['monthly'],
                    till       : o['recurring-application-charge']['paid-till'],
                    expired_at : o['recurring-application-charge']['trial-expired-at'],
                    created_at : o['recurring-application-charge']['created-at'],
                    updated_at : o['recurring-application-charge']['updated-at'],
                    blocked    : o['recurring-application-charge']['blocked']
                  });
                  p.save(function (err) {
                    if (err) {
                      log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                      setImmediate(done);
                    } else {
                      log('Магазин id=' + job.data.id + ' Создан счёт');
                      setImmediate(done);
                    }
                  });
                } else {
                  charge.guid = o['recurring-application-charge']['id'];
                  charge.monthly = o['recurring-application-charge']['monthly'];
                  charge.till = o['recurring-application-charge']['paid-till'];
                  charge.expired_at = o['recurring-application-charge']['trial-expired-at'];
                  charge.created_at = o['recurring-application-charge']['created-at'];
                  charge.updated_at = o['recurring-application-charge']['updated-at'];
                  charge.blocked = o['recurring-application-charge']['blocked'];
                  charge.save(function (err) {
                    if (err) {
                      log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                      setImmediate(done);
                    } else {
                      log('Магазин id=' + job.data.id + ' Сохранён счёт в базу приложения');
                      setImmediate(done);
                    }
                  });
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
      }).delay(600).priority('normal').save();
    } else {
      jobs.create('close', {
        taskid: taskid,
        message: message
      }).delay(600).priority('normal').save();
    }
  },

  closeTask: function(taskid, message, done) {
    log('Закрываем задание');
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
          log('Магазин id=' + task.insalesid + ' Ошибка: ' + err, 'error');
          Queue.createJobCloseTask(taskid, message);
          setImmediate(done);
        } else {
          log('Магазин id=' + task.insalesid + ' Задание успешно закрыто');
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
  Queue.createCoupons(job, done);
});

jobs.process('close', function(job, done) {
  // создаём купоны
  Queue.closeTask(job.data.taskid, job.data.message, done);
});

jobs.process('sync', function(job, done) {
  // после установки первое задание на синхронизации
  var T = new Tasks({
    insalesid: job.data.id,
    type: 5,
    status: 1,
    created_at : new Date(),
    updated_at : new Date()
  });
  T.save(function (err) {
    if (err) {
      log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
      setImmediate(done);
    } else {
      log('Магазин id=' + job.data.id + ' Создано задание на синхронизацию после установки');
      setImmediate(done);
    }
  });
});

jobs.process('pay', function(job, done) {
  // после установки выставить счёт
  Queue.pay(job, done);
});

jobs.process('checkpay', function(job, done) {
  // дёргаем данные об оплате из insales
  Charges.findOne({insalesid: job.data.id}, function(err, charge) {
    rest.get('http://' + process.env.insalesid
            + ':'
            + job.data.token
            + '@'
            + job.data.insalesurl
            + '/admin/recurring_application_charge.xml', {
              headers: {'Content-Type': 'application/xml'}
            }).once('complete', function(o) {
      if (o instanceof Error) {
        log('Магазин id=' + job.data.id + ' Ошибка: ' + o.message, 'error');
        setImmediate(done);
      } else {
        if (o.errors) {
          log('Магазин id=' + job.data.id + ' Ошибка: ' + o.errors, 'error');
          setImmediate(done);
        } else {
          if (_.isEmpty(charge)) {
            var p = new Charges({
              insalesid  : job.data.id,
              guid       : o['recurring-application-charge']['id'],
              monthly    : o['recurring-application-charge']['monthly'],
              till       : o['recurring-application-charge']['paid-till'],
              created_at : o['recurring-application-charge']['created-at'],
              updated_at : o['recurring-application-charge']['updated-at'],
              blocked    : o['recurring-application-charge']['blocked']
            });
            p.save(function (err) {
              if (err) {
                log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                setImmediate(done);
              } else {
                log('Магазин id=' + job.data.id + ' Сохранён счёт в базу приложения');
                setImmediate(done);
              }
            });
          } else {
            charge.guid = o['recurring-application-charge']['id'];
            charge.monthly = o['recurring-application-charge']['monthly'];
            charge.till = o['recurring-application-charge']['paid-till'];
            charge.expired_at = o['recurring-application-charge']['trial-expired-at'];
            charge.created_at = o['recurring-application-charge']['created-at'];
            charge.updated_at = o['recurring-application-charge']['updated-at'];
            charge.blocked = o['recurring-application-charge']['blocked'];
            charge.save(function (err) {
              if (err) {
                log('Магазин id=' + job.data.id + ' Ошибка: ' + err, 'error');
                setImmediate(done);
              } else {
                log('Магазин id=' + job.data.id + ' Сохранён счёт в базу приложения');
                setImmediate(done);
              }
            });
          }
        }
      }
    });
  });
});

mongoose.connect('mongodb://' + process.env.mongo + '/coupons');

var Apps = require('./models').Apps;
var Tasks = require('./models').Task;
var Settings = require('./models').Sett;
var Charges = require('./models').Chrg;
var Coupons = require('./models').Coup;
var Collections = require('./models').Coll;

//Логгер в одном месте, для упрощения перезда на любой логгер.
function log(logMsg, logType) {
  if (logMsg instanceof Error) logger.error(logMsg.stack);
  if (!_.isUndefined(logType)) {
    logger.log(logType, logMsg);
  } else {
    logger.info(logMsg);
  }
};