'use strict';
const mongoose = require('mongoose');
const kue      = require('kue');
const queue    = kue.createQueue({
  disableSearch: true,
  jobEvents: false,
  redis: {
    host: process.env.redis,
  },
});
const fs       = require('fs');
const moment   = require('moment');
const as       = require('async');
const cc       = require('coupon-code');
const _        = require('lodash');
const xl       = require('excel4node');
const XLSX     = require('xlsx');
const log      = require('winston-logs')(require('./log'));
const insales  = require('insales')({
  id: process.env.insalesid,
  secret: process.env.insalessecret,
});

function errorNotify(params) {
  const errid = cc.generate({
    parts: 1,
    partLen: 6,
  });
  log.error(`ShopId=${params.id} ${errid} Error: ${JSON.stringify(params.err)}`);
  if (params.rest) {
    log.error(`${errid} ${params.rest}`);
  }
  log.error(`${errid} ${params.msg}`);
  throw new Error(`Ошибка: #${errid}`);
}

const modelsPath = `${__dirname}/models`;
fs.readdirSync(modelsPath).forEach(file => {
  if (~file.indexOf('js')) {
    require(`${modelsPath}/${file}`);
  }
});


const Apps = mongoose.model('Apps');
const Tasks = mongoose.model('Tasks');
const Coupons = mongoose.model('Coupons');
const Collections = mongoose.model('Collections');

queue.watchStuckJobs();

queue.on('error', err => {
  log.error(`Error in kue: ${JSON.stringify(err)}`);
});

function graceful() {
  queue.shutdown(5000, err => {
    log.warn('Kue are shutdown', err || '');
    process.exit(0);
  });
}

process.on('SIGTERM', graceful);
process.on('SIGINT', graceful);

function Job(id, taskid, type) {
  this.data = {
    id,
    taskid,
    type,
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
    group: null,
  };
}

// проверка на новые задания
setInterval(() => {
  Tasks.aggregate([{
    $match: {
      status: {
        $in : [1, 2],
      },
    },
  }, {
    $group: {
      _id: {
        insalesid: '$insalesid',
      },
      date: {
        $min: '$created_at',
      },
    },
  }, {
    $sort : {
      date: 1,
    },
  }, {
    $limit: 1,
  }], (err, result) => {
    if (err) {
      errorNotify({
        id: 0,
        msg: 'Error when check new tasks',
        err,
      });
    } else {
      let j = {};
      as.eachSeries(result, (item, done) => {
        Tasks.find({
          insalesid: item._id.insalesid,
        }).find({
          created_at: item.date,
        }).exec((err, t) => {
          if (err) {
            errorNotify({
              id: item._id.insalesid,
              msg: 'Error when check new tasks',
              err,
            });
            done();
          } else {
            const _task = t[0];
            if (_task.status === 1) {
              if ((_task.type === 5) || (_task.type === 8)) {
                j = new Job(_task.insalesid, _task._id, _task.type);
                createJobDeleteCouponsFromApp(j);
                _task.status = 2;
                _task.count = 1;
                _task.updated_at = new Date();
                _task.save(err => {
                  if (err) {
                    errorNotify({
                      id: _task.insalesid,
                      msg: 'Error when change status to 2',
                      err,
                    });
                    done();
                  } else {
                    log.info(`ShopId=${_task.insalesid} change status to 2 1`);
                    done();
                  }
                });
              } else if (_task.type === 6) {
                j = new Job(_task.insalesid, _task._id, _task.type);
                j.data.variant = _task.variant;
                createJobDeleteCouponsFromApp(j);
                _task.status = 2;
                _task.count = 1;
                _task.updated_at = new Date();
                _task.save(err => {
                  if (err) {
                    errorNotify({
                      id: _task.insalesid,
                      msg: 'Error when change status to 2',
                      err,
                    });
                    done();
                  } else {
                    log.info(`ShopId=${_task.insalesid} change status to 2 2`);
                    done();
                  }
                });
              } else if (_task.type === 7) {
                j = new Job(_task.insalesid, _task._id, _task.type);
                j.data.path = _task.path;
                createJobDeleteCouponsFromApp(j);
                _task.status = 2;
                _task.count = 1;
                _task.updated_at = new Date();
                _task.save(err => {
                  if (err) {
                    errorNotify({
                      id: _task.insalesid,
                      msg: 'Error when change status to 2',
                      err: err,
                    });
                    done();
                  } else {
                    log.info(`ShopId=${_task.insalesid} change status to 2 3`);
                    done();
                  }
                });
              } else {
                j = new Job(_task.insalesid, _task._id, _task.type);
                j.data.numbers = _task.numbers;
                j.data.parts = _task.parts;
                j.data.length = _task.length;
                j.data.act = _task.act;
                j.data.actclient = _task.actclient;
                j.data.minprice = _task.minprice;
                j.data.variant = _task.variant;
                j.data.typediscount = _task.typediscount;
                j.data.discount = _task.discount;
                j.data.until = _task.until;
                j.data.group = _task.group;
                createJobDeleteCouponsFromApp(j);
                _task.status = 2;
                _task.count = 1;
                _task.updated_at = new Date();
                _task.save(err => {
                  if (err) {
                    errorNotify({
                      id: _task.insalesid,
                      msg: 'Error when change status to 2',
                      err,
                    });
                    done();
                  } else {
                    log.info(`ShopId=${_task.insalesid} change status to 2 4`);
                    done();
                  }
                });
              }
            } else if (_task.status === 2) {
              if (_task.count === 3) {
                _task.status = 3;
                _task.message = 'произошла ошибка';
                _task.updated_at = new Date();
                _task.save(err => {
                  if (err) {
                    errorNotify({
                      id: _task.insalesid,
                      msg: 'Error when change status to 3',
                      err,
                    });
                    done();
                  } else {
                    log.info(`ShopId=${_task.insalesid} Close task, limit of attempts`);
                    done();
                  }
                });
              } else {
                const hours = Math.abs(new Date() - new Date(_task.updated_at)) / 36e5;
                if (hours > 0.5) {
                  _task.status = 1;
                  _task.count += 1;
                  _task.updated_at = new Date();
                  _task.save(err => {
                    if (err) {
                      errorNotify({
                        id: _task.insalesid,
                        msg: `Error when rerun task, status to 1, count ${_task.count}`,
                        err,
                      });
                      done();
                    } else {
                      log.info(`ShopId=${_task.insalesid} Rerun task, attempt: ${_task.count}`);
                      done();
                    }
                  });
                } else {
                  done();
                }
              }
            } else {
              done();
            }
          }
        });
      });
    }
  });
}, 5000);

function isEven(n) {
  return n === parseFloat(n) ? !(n % 2) : void 0;
}

function rowStyle(wb, odd, middle, header) {
  const color = ((odd) ? 'E9E7E3' : 'FFFFFF');
  let row = this;
  row = wb.Style();
  if (header) {
    row.Font.Family('Arial');
    row.Font.Size(12);
    row.Font.WrapText(true);
    row.Font.Alignment.Vertical('center');
    row.Font.Alignment.Horizontal('center');
    row.Border({
      top:{
        style: 'thick',
      },
      bottom:{
        style: 'thick',
      },
      left:{
        style: 'thick',
      },
      right:{
        style: 'thick',
      },
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
        style: 'thin',
        color: 'A0A0A4',
      },
    });
  }
  return row;
}

// 1 удалить все купоны, создать новые
// 2 создать новые, добавив к текущим
// 3 удалить использованные, создать новые
// 4 удалить неиспользованные, создать новые

function createJobDeleteCouponsFromApp(job) {
  queue.create('inSales', {
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
    group: job.data.group,
    taskType: 2,
  }).attempts(3)
    .priority('normal')
    .removeOnComplete(true)
    .ttl(10000)
    .save();
}

function deleteCouponsFromApp(job, done) {
  Coupons.remove({
    insalesid: job.data.id,
  }, (err) => {
    if (err) {
      log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
      done(err);
    } else {
      log.info(`Магазин id=${job.data.id} Удалены купоны из базы приложения`);
      createJobUpdateTimeTask(job.data.taskid);
      createJobDeleteCollectionsFromApp(job);
      done();
    }
  });
}

function createJobDeleteCollectionsFromApp(job) {
  queue.create('inSales', {
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
    group: job.data.group,
    taskType: 3,
  }).attempts(3)
    .priority('normal')
    .removeOnComplete(true)
    .ttl(10000)
    .save();
}

function deleteCollectionsFromApp(job, done) {
  Collections.remove({
    insalesid: job.data.id,
  }, (err) => {
    if (err) {
      log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
      done(err);
    } else {
      log.info(`Магазин id=${job.data.id} Удалены категории из базы приложения`);
      createJobUpdateTimeTask(job.data.taskid);
      createJobGetCollections(job);
      done();
    }
  });
}

function createJobGetCollections(job) {
  const p = (job.data.page === undefined) ? 1 : job.data.page;
  log.info(`Магазин id=${job.data.id} Задание на получение категорий`);
  queue.create('inSales', {
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
    group: job.data.group,
    taskType: 4,
  }).attempts(3)
    .priority('normal')
    .removeOnComplete(true)
    .ttl(15000)
    .save();
}

function getCollections(job, ctx, done) {
  Apps.findOne({
    insalesid: job.data.id,
  }, (err, app) => {
    if (app.enabled === true) {
      insales.listCollection({
        token: app.token,
        url: app.insalesurl,
      }).then(data => {
        const _collections = data.data;
        log.info(`Магазин id=${job.data.id} Заходим в функцию дёрганья категорий`);
        if (_.isUndefined(_collections.collections.collection[0])) {
          const coll = _collections.collections.collection;
          const collection = new Collections({
            insalesid           : job.data.id,
            colid               : coll.id,
            parentid            : coll['parent-id'],
            name                : coll.title,
            created_at          : coll['created-at'],
            updated_at          : coll['updated-at'],
          });
          collection.save(err => {
            if (err) {
              log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
              done(err);
            } else {
              log.info(`Магазин id=${job.data.id} Сохранена категория из магазина в базу приложения`);
              createJobGetCoupons(job);
              createJobUpdateTimeTask(job.data.taskid);
              done();
            }
          });
        } else {
          as.each(_collections.collections.collection, (coll, callback) => {
            const collection = new Collections({
              insalesid           : job.data.id,
              colid               : coll.id,
              parentid            : coll['parent-id'],
              name                : coll.title,
              created_at          : coll['created-at'],
              updated_at          : coll['updated-at'],
            });
            collection.save(err => {
              if (err) {
                log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                callback();
              } else {
                log.info(`Магазин id=${job.data.id} Сохранена категория из магазина в базу приложения`);
                callback();
              }
            });
          }, e => {
            if (e) {
              log.error(`Магазин id=${job.data.id} Ошибка: ${e}`);
              createJobGetCollections(job);
              done(e);
            } else {
              log.info(`Магазин id=${job.data.id} Все категории скачены из insales`);
              createJobGetCoupons(job);
              createJobUpdateTimeTask(job.data.taskid);
              done();
            }
          });
        }
      }).catch(err => {
        if (err.response.statusCode === 401) {
          createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
          createJobDisableApp(job.data.taskid);
          done();
        } else if (err.response.statusCode === 503) {
          createJobUpdateTimeTask(job.data.taskid);
          const _timeout = +err.response.headers['retry-after'] || 100;
          ctx.pause(5000, err => {
            if (err) {
              log.error(`Магазин id=${job.data.id} Ошибка паузы заданий. ${err}`);
            } else {
              log.warn(`Магазин id=${job.data.id} Лимит API, встаём на паузу`);
              setTimeout(() => {
                ctx.resume();
              }, _timeout * 1000);
            }
          });
        } else {
          log.error(`${err.type}\n${err.url}\n${err.response.req.method} ${err.response.req.path}\n${JSON.stringify(err.msg)}`);
          done(err.response.statusCode);
        }
      });
    } else {
      log.warn(`ShopId=${job.data.id} App not installed to this shop`);
      createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
      done();
    }
  });
}

function createJobGetCoupons(job) {
  const p = (job.data.page === undefined) ? 1 : job.data.page;
  log.info(`Магазин id=${job.data.id} Задание на получение купонов`);
  queue.create('inSales', {
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
    group: job.data.group,
    taskType: 6,
  }).attempts(3)
    .priority('normal')
    .removeOnComplete(true)
    .ttl(15000)
    .save();
}

function getCouponsFromShop(job, ctx, done) {
  Apps.findOne({
    insalesid: job.data.id,
  }, (err, app) => {
    if (app.enabled === true) {
      insales.listCoupon({
        token: app.token,
        url: app.insalesurl,
        page: job.data.page,
      }).then(data => {
        const _coupons = data.data;
        log.info(`Магазин id=${job.data.id} Заходим в функцию дёрганья купонов`);
        if (typeof _coupons['discount-codes'] === 'undefined') {
          if ((job.data.variant === 1) ||
              (job.data.variant === 3) ||
              (job.data.variant === 4)) {
            log.info(`Магазин id=${job.data.id} Уходим на удаление купонов`);
            createJobDeleteCoupons(job);
            createJobUpdateTimeTask(job.data.taskid);
            done();
          } else if (job.data.variant === 2) {
            log.info(`Магазин id=${job.data.id} Уходим на создание купонов`);
            createJobCreateCoupons(job);
            createJobUpdateTimeTask(job.data.taskid);
            done();
          } else if (job.data.type === 7) {
            log.info(`Магазин id=${job.data.id} Уходим на импорт файла`);
            createJobParseXLSX(job);
            createJobUpdateTimeTask(job.data.taskid);
            done();
          } else if (job.data.type === 8) {
            log.info(`Магазин id=${job.data.id} Уходим на экспорт файла`);
            createExportFile(job);
            createJobUpdateTimeTask(job.data.taskid);
            done();
          } else {
            log.info(`Магазин id=${job.data.id} Уходим на закрывание задания`);
            createJobCloseTask(job.data.taskid);
            createJobUpdateTimeTask(job.data.taskid);
            done();
          }
        } else {
          if (_.isUndefined(_coupons['discount-codes']['discount-code'][0])) {
            const coup = _coupons['discount-codes']['discount-code'];
            const collection = _.map(coup['discount-collections']
                                     ['discount-collection'], 'collection-id').join(',');
            if (!_.isEmpty(collection)) {
              const arr = [];
              const C = Collections.find({
                insalesid: job.data.id,
              });
              C.find({
                colid: {
                  $in:collection,
                },
              });
              C.exec((err, collec) => {
                if (err) {
                  log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                  done(err);
                } else {
                  for (let i = 0, len = collec.length; i < len; i++) {
                    arr.push(collec[i].name);
                  }
                  const coupon = new Coupons({
                    insalesid           : job.data.id,
                    guid                : coup.id,
                    code                : coup.code,
                    description         : coup.description,
                    act                 : coup['act-once'],
                    actclient           : coup['act-once-for-client'],
                    typeid              : coup['type-id'],
                    discount            : coup.discount,
                    minprice            : coup['min-price'],
                    worked              : coup.worked,
                    discountcollections : arr.join(',').replace(/,/g, ',\n'),
                    collections_id      : collection,
                    expired_at          : coup['expired-at'],
                    created_at          : coup['created-at'],
                    updated_at          : coup['updated-at'],
                    disabled            : coup.disabled,
                  });
                  coupon.save(err => {
                    if (err) {
                      log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                      done(err);
                    } else {
                      log.info(`Магазин id=${job.data.id} Сохранён купон из магазина в базу приложения`);
                      job.data.page++;
                      createJobGetCoupons(job);
                      createJobUpdateTimeTask(job.data.taskid);
                      done();
                    }
                  });
                }
              });
            } else {
              const coupon = new Coupons({
                insalesid           : job.data.id,
                guid                : coup.id,
                code                : coup.code,
                description         : coup.description,
                act                 : coup['act-once'],
                actclient           : coup['act-once-for-client'],
                typeid              : coup['type-id'],
                discount            : coup.discount,
                minprice            : coup['min-price'],
                worked              : coup.worked,
                discountcollections : 'Все',
                collections_id      : '',
                expired_at          : coup['expired-at'],
                created_at          : coup['created-at'],
                updated_at          : coup['updated-at'],
                disabled            : coup.disabled,
              });
              coupon.save(err => {
                if (err) {
                  log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                  done(err);
                } else {
                  log.info(`Магазин id=${job.data.id} Сохранён купон из магазина в базу приложения`);
                  job.data.page++;
                  createJobGetCoupons(job);
                  createJobUpdateTimeTask(job.data.taskid);
                  done();
                }
              });
            }
          } else {
            as.each(_coupons['discount-codes']['discount-code'], (coup, callback) => {
              const collection = _.map(coup['discount-collections']
                                     ['discount-collection'], 'collection-id');
              if (!_.isEmpty(collection)) {
                const arr = [];
                const C = Collections.find({
                  insalesid: job.data.id,
                });
                C.find({
                  colid: {
                    $in:collection,
                  },
                });
                C.exec((err, collec) => {
                  if (err) {
                    log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                    callback();
                  } else {
                    for (let i = 0, len = collec.length; i < len; i++) {
                      arr.push(collec[i].name);
                    }
                    const coupon = new Coupons({
                      insalesid           : job.data.id,
                      guid                : coup.id,
                      code                : coup.code,
                      description         : coup.description,
                      act                 : coup['act-once'],
                      actclient           : coup['act-once-for-client'],
                      typeid              : coup['type-id'],
                      discount            : coup.discount,
                      minprice            : coup['min-price'],
                      worked              : coup.worked,
                      discountcollections : arr.join(',').replace(/,/g, ',\n'),
                      collections_id      : collection.join(','),
                      expired_at          : coup['expired-at'],
                      created_at          : coup['created-at'],
                      updated_at          : coup['updated-at'],
                      disabled            : coup.disabled,
                    });
                    coupon.save(err => {
                      if (err) {
                        log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                        callback();
                      } else {
                        log.info(`Магазин id=${job.data.id} Сохранён купон из магазина в базу приложения`);
                        callback();
                      }
                    });
                  }
                });
              } else {
                const coupon = new Coupons({
                  insalesid           : job.data.id,
                  guid                : coup.id,
                  code                : coup.code,
                  description         : coup.description,
                  act                 : coup['act-once'],
                  actclient           : coup['act-once-for-client'],
                  typeid              : coup['type-id'],
                  discount            : coup.discount,
                  minprice            : coup['min-price'],
                  worked              : coup.worked,
                  discountcollections : 'Все',
                  collections_id      : '',
                  expired_at          : coup['expired-at'],
                  created_at          : coup['created-at'],
                  updated_at          : coup['updated-at'],
                  disabled            : coup.disabled,
                });
                coupon.save(err => {
                  if (err) {
                    log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                    callback();
                  } else {
                    log.info(`Магазин id=${job.data.id} Сохранён купон из магазина в базу приложения`);
                    callback();
                  }
                });
              }
            }, e => {
              if (e) {
                log.error(`Магазин id=${job.data.id} Ошибка: ${e}`);
                done(e);
              } else {
                log.info(`Магазин id=${job.data.id} Получение купонов на странице ${job.data.page} завершено`);
                job.data.page++;
                createJobGetCoupons(job);
                createJobUpdateTimeTask(job.data.taskid);
                done();
              }
            });
          }
        }
      }).catch(err => {
        if (err.response.statusCode === 401) {
          createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
          createJobDisableApp(job.data.taskid);
          done();
        } else if (err.response.statusCode === 503) {
          createJobUpdateTimeTask(job.data.taskid);
          const _timeout = +err.response.headers['retry-after'] || 100;
          ctx.pause(5000, err => {
            if (err) {
              log.error(`Магазин id=${job.data.id} Ошибка паузы заданий. ${err}`);
            } else {
              log.warn(`Магазин id=${job.data.id} Лимит API, встаём на паузу`);
              setTimeout(() => {
                ctx.resume();
              }, _timeout * 1000);
            }
          });
        } else {
          log.error(`${err.type}\n${err.url}\n${err.response.req.method} ${err.response.req.path}\n${JSON.stringify(err.msg)}`);
          done(err.response.statusCode);
        }
      });
    } else {
      log.warn(`ShopId=${job.data.id} App not installed to this shop`);
      createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
      done();
    }
  });
}

function createJobDeleteCoupons(job) {
  const C = Coupons.find({
    insalesid: job.data.id,
  });
  if (job.data.variant === 3) {
    C.and([{
      worked: false,
    }, {
      disabled: false,
    }]);
  } else if (job.data.variant === 4) {
    C.and([{
      worked: true,
    }, {
      disabled: false,
    }]);
  }
  C.exec((err, coupons) => {
    as.each(coupons, (coup, callback) => {
      queue.create('inSales', {
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
        until: job.data.until,
        taskType: 5,
      }).attempts(3)
        .priority('normal')
        .removeOnComplete(true)
        .ttl(15000)
        .save();
      callback();
    }, e => {
      if (e) {
        log.error(`Магазин id=${job.data.id} Ошибка: ${e}`);
      } else {
        log.info(`Магазин id=${job.data.id} Задание на удаление создано`);
        queue.create('inSales', {
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
          until: job.data.until,
          taskType: 5,
        }).attempts(3)
          .priority('normal')
          .removeOnComplete(true)
          .ttl(15000)
          .save();
        createJobUpdateTimeTask(job.data.taskid);
      }
    });
  });
}

function deleteCoupons(job, ctx, done) {
  Apps.findOne({
    insalesid: job.data.id,
  }, (err, app) => {
    if (app.enabled === true) {
      insales.removeCoupon({
        token: app.token,
        url: app.insalesurl,
        couponid: job.data.couponid,
      }).then(data => {
        const _output = data.data;
        if (_output !== null && _output.errors) {
          log.error(`Магазин id=${job.data.id} Ошибка: ${JSON.stringify(_output)}`);
          const re = new RegExp(job.data.couponid, 'g');
          if (_output.errors.error.match(re)) {
            Coupons.findOneAndRemove({
              guid: job.data.couponid,
            }, (err, r) => {
              if (err) {
                log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                done(err);
              } else {
                log.info(`Магазин id=${job.data.id} Удалён купон из магазина и базы приложения id=${job.data.couponid}`);
                done();
              }
            });
          }
        } else {
          Coupons.findOneAndRemove({
            guid: job.data.couponid,
          }, (err, r) => {
            if (err) {
              log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
              done(err);
            } else {
              log.info(`Магазин id=${job.data.id} Удалён купон из магазина и базы приложения id=${job.data.couponid}`);
              done();
            }
          });
        }
      }).catch(err => {
        if (err.response.statusCode === 401) {
          createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
          createJobDisableApp(job.data.taskid);
          done();
        } else if (err.response.statusCode === 503) {
          createJobUpdateTimeTask(job.data.taskid);
          const _timeout = +err.response.headers['retry-after'] || 100;
          ctx.pause(5000, err => {
            if (err) {
              log.error(`Магазин id=${job.data.id} Ошибка паузы заданий. ${err}`);
            } else {
              log.warn(`Магазин id=${job.data.id} Лимит API, встаём на паузу`);
              setTimeout(() => {
                ctx.resume();
              }, _timeout * 1000);
            }
          });
        } else {
          log.error(`${err.type}\n${err.url}\n${err.response.req.method} ${err.response.req.path}\n${JSON.stringify(err.msg)}`);
          done();
        }
      });
    } else {
      log.warn(`ShopId=${job.data.id} App not installed to this shop`);
      createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
      done();
    }
  });
}

function createJobParseXLSX(job) {
  let iter = 1;
  let error = 0;
  const workbook = XLSX.readFile(job.data.path);
  const sheet = XLSX.utils.sheet_to_row_object_array(workbook.Sheets['Купоны']);
  as.each(sheet, (row, callback) => {
    if (error === 0) {
      iter++;
      let message = '';
      if (_.isUndefined(row['Код купона'])) {
        message = `Ошибка в ячейке A ${iter}`;
        error = 1;
        createJobCloseTask(job.data.taskid, message);
        callback();
      } else if (_.isUndefined(row['Тип купона'])) {
        message = `Ошибка в ячейке B ${iter}`;
        error = 1;
        createJobCloseTask(job.data.taskid, message);
        callback();
      } else if (_.isUndefined(row['Тип скидки'])) {
        message = `Ошибка в ячейке C ${iter}`;
        error = 1;
        createJobCloseTask(job.data.taskid, message);
        callback();
      } else if (_.isUndefined(row['Величина скидки'])) {
        message = `Ошибка в ячейке D ${iter}`;
        error = 1;
        createJobCloseTask(job.data.taskid, message);
        callback();
      } else if (_.isUndefined(row['Один раз для каждого клиента'])) {
        message = `Ошибка в ячейке H ${iter}`;
        error = 1;
        createJobCloseTask(job.data.taskid, message);
        callback();
      } else if (_.isUndefined(row['Заблокирован'])) {
        message = `Ошибка в ячейке J ${iter}`;
        error = 1;
        createJobCloseTask(job.data.taskid, message);
        callback();
      } else {
        const C = Coupons.find({
          insalesid: job.data.id,
        });
        C.find({
          code: row['Код купона'],
        });
        C.exec((err, coupon) => {
          if (err) {
            log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
            callback();
          } else {
            let typeDiscount = '';
            let minprice = '';
            let act = '';
            let actclient = '';
            let disabled = '';
            if (row['Тип скидки'] === 'процент') {
              typeDiscount = 1;
            } else if (row['Тип скидки'] === 'денежная величина') {
              typeDiscount = 2;
            }
            if (row['Тип купона'] === 'одноразовый') {
              act = 1;
            } else if (row['Тип купона'] === 'многоразовый') {
              act = 0;
            }
            if (row['Заблокирован'] === 'да') {
              disabled = true;
            } else if (row['Заблокирован'] === 'нет') {
              disabled = false;
            }
            if (row['Один раз для каждого клиента'] === 'да') {
              actclient = true;
            } else if (row['Один раз для каждого клиента'] === 'нет') {
              actclient = false;
            }
            if (_.isNumber(parseFloat(row['Минимальная сумма заказа']))) {
              minprice = parseFloat(row['Минимальная сумма заказа'].toString().replace(',', '.')).toFixed(1);
            } else {
              minprice = null;
            }
            if (_.isUndefined(coupon[0])) {
              queue.create('inSales', {
                id: job.data.id,
                taskid: job.data.taskid,
                type: 2,
                coupon: row['Код купона'],
                desc: row['Описание'],
                act,
                actclient,
                minprice,
                discount: parseFloat(row['Величина скидки']).toFixed(2),
                typediscount: typeDiscount,
                until: row['Действителен по'],
                disabled,
                taskType: 8,
              }).attempts(3)
                .priority('normal')
                .removeOnComplete(true)
                .ttl(15000)
                .save();
              callback();
            } else {
              const objectDB = {
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
                until: moment(coupon[0].expired_at).format('DD-MM-YYYY'),
                disabled: coupon[0].disabled,
                taskType: 9,
              };
              const objectXLSX = {
                id: job.data.id,
                taskid: job.data.taskid,
                guid: coupon[0].guid,
                type: 2,
                coupon: row['Код купона'],
                act,
                actclient,
                minprice: parseFloat(minprice),
                discount: parseFloat(row['Величина скидки']).toFixed(2),
                typediscount: typeDiscount,
                until: row['Действителен по'],
                disabled,
                taskType: 9,
              };
              if (!_.isEqual(objectDB, objectXLSX)) {
                log.info(`Магазин id=${job.data.id} Купон ${row['Код купона']} изменён`);
                queue.create('inSales', objectXLSX)
                  .attempts(3)
                  .priority('normal')
                  .removeOnComplete(true)
                  .ttl(15000)
                  .save();
                callback();
              } else {
                log.info(`Магазин id=${job.data.id} В файле xlsx и базе приложения купоны одинаковые, игнорируем изменения`);
                callback();
              }
            }
          }
        });
      }
    } else {
      callback();
    }
  }, e => {
    if (e) {
      log.error(`Магазин id=${job.data.id} Ошибка: ${e}`);
    } else {
      log.info(`Магазин id=${job.data.id} Импорт купонов завершён успешно`);
      createJobUpdateTimeTask(job.data.taskid);
      createJobCloseTask(job.data.taskid);
    }
  });
}

function updateCoupon(job, ctx, done) {
  Apps.findOne({
    insalesid: job.data.id,
  }, (err, app) => {
    if (app.enabled === true) {
      const description = (_.isUndefined(job.data.desc) ? 'генератор купонов' : job.data.desc);
      const disabled = (_.isUndefined(job.data.disabled) ? false : job.data.disabled);
      const coupon = {
        discount_code: {
          code: job.data.coupon,
          act_once: job.data.act,
          discount: job.data.discount,
          type_id: job.data.typediscount,
          description,
          disabled: `${disabled}`,
          'expired-at': moment(job.data.until, 'DD.MM.YYYY').format('YYYY-MM-DD'),
        },
      };
      if (!_.isUndefined(job.data.minprice) ||
          (+job.data.minprice !== 0) ||
          (!_.isNull(job.data.minprice))) {
        coupon.discount_code['min-price'] = job.data.minprice;
      }
      if (_.isUndefined(job.data.actclient) || (job.data.actclient === '')) {
        coupon.discount_code.act_once_for_client = '0';
      } else {
        coupon.discount_code.act_once_for_client = '1';
      }
      insales.editCoupon({
        token: app.token,
        url: app.insalesurl,
        couponid: job.data.guid,
        coupon,
      }).then(data => {
        queue.create('inSales', {
          id: job.data.id,
          guid: job.data.guid,
          taskType: 7,
        }).attempts(3)
          .priority('normal')
          .removeOnComplete(true)
          .ttl(15000)
          .save();
        done();
      }).catch(err => {
        if (err.response.statusCode === 401) {
          createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
          createJobDisableApp(job.data.taskid);
          done();
        } else if (err.response.statusCode === 503) {
          createJobUpdateTimeTask(job.data.taskid);
          const _timeout = +err.response.headers['retry-after'] || 100;
          ctx.pause(5000, err => {
            if (err) {
              log.error(`Магазин id=${job.data.id} Ошибка паузы заданий. ${err}`);
            } else {
              log.warn(`Магазин id=${job.data.id} Лимит API, встаём на паузу`);
              setTimeout(() => {
                ctx.resume();
              }, _timeout * 1000);
            }
          });
        } else {
          log.error(`${err.type}\n${err.url}\n${err.response.req.method} ${err.response.req.path}\n${JSON.stringify(err.msg)}`);
          done(err.response.statusCode);
        }
      });
    } else {
      log.warn(`ShopId=${job.data.id} App not installed to this shop`);
      createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
      done();
    }
  });
}

function getCouponFromShop(job, ctx, done) {
  Apps.findOne({
    insalesid: job.data.id,
  }, (err, app) => {
    if (app.enabled === true) {
      insales.getCoupon({
        token: app.token,
        url: app.insalesurl,
        couponid: job.data.guid,
      }).then(data => {
        const _couponInsales = data.data;
        log.info(data.response.headers['api-usage-limit']);
        Coupons.findOne({
          guid: job.data.guid,
        }, (err, c) => {
          const _coupon = c;
          if (err) {
            log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
            done();
          } else {
            _coupon.code        = _couponInsales['discount-code'].code;
            _coupon.description = _couponInsales['discount-code'].description;
            _coupon.act         = _couponInsales['discount-code']['act-once'];
            _coupon.actclient   = _couponInsales['discount-code']['act-once-for-client'];
            _coupon.typeid      = _couponInsales['discount-code']['type-id'];
            _coupon.discount    = _couponInsales['discount-code'].discount;
            _coupon.minprice    = _couponInsales['discount-code']['min-price'];
            _coupon.worked      = _couponInsales['discount-code'].worked;
            _coupon.expired_at  = _couponInsales['discount-code']['expired-at'];
            _coupon.created_at  = _couponInsales['discount-code']['created-at'];
            _coupon.updated_at  = _couponInsales['discount-code']['updated-at'];
            _coupon.disabled    = _couponInsales['discount-code'].disabled;
            _coupon.save(err => {
              if (err) {
                log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                done();
              } else {
                log.info(`Магазин id=${job.data.id} Получены данные купона`);
                done();
              }
            });
          }
        });
      }).catch(err => {
        if (err.response.statusCode === 401) {
          createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
          createJobDisableApp(job.data.taskid);
          done();
        } else if (err.response.statusCode === 503) {
          createJobUpdateTimeTask(job.data.taskid);
          const _timeout = +err.response.headers['retry-after'] || 100;
          ctx.pause(5000, err => {
            if (err) {
              log.error(`Магазин id=${job.data.id} Ошибка паузы заданий. ${err}`);
            } else {
              log.warn(`Магазин id=${job.data.id} Лимит API, встаём на паузу`);
              setTimeout(() => {
                ctx.resume();
              }, _timeout * 1000);
            }
          });
        } else {
          log.error(`${err.type}\n${err.url}\n${err.response.req.method} ${err.response.req.path}\n${JSON.stringify(err.msg)}`);
          done(err.response.statusCode);
        }
      });
    } else {
      log.warn(`ShopId=${job.data.id} App not installed to this shop`);
      createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
      done();
    }
  });
}

function createJobCreateCoupons(job) {
  let count = 0;
  as.whilst(() => {
    return count < job.data.numbers;
  }, callback => {
    count++;
    queue.create('inSales', {
      id: job.data.id,
      taskid: job.data.taskid,
      type: 2,
      coupon: cc.generate({
        parts: job.data.parts,
        partLen: job.data.length,
      }),
      act: job.data.act,
      actclient: job.data.actclient,
      minprice: job.data.minprice,
      discount: job.data.discount,
      typediscount: job.data.typediscount,
      until: job.data.until,
      taskType: 8,
    }).attempts(3)
      .priority('normal')
      .removeOnComplete(true)
      .ttl(15000)
      .save();
    callback();
  }, err => {
    if (err) {
      log.error(err);
    } else {
      createJobUpdateTimeTask(job.data.taskid);
      createJobCloseTask(job.data.taskid);
    }
  });
}

function createCoupons(job, ctx, done) {
  Apps.findOne({
    insalesid: job.data.id,
  }, (err, app) => {
    if (app.enabled === true) {
      const description = (_.isUndefined(job.data.desc) ? 'генератор купонов' : job.data.desc);
      const disabled = (_.isUndefined(job.data.disabled) ? false : job.data.disabled);
      const coupon = {
        discount_code: {
          code: job.data.coupon,
          act_once: job.data.act,
          discount: job.data.discount,
          type_id: job.data.typediscount,
          description,
          disabled: `${disabled}`,
          'expired-at': moment(job.data.until, 'DD.MM.YYYY').format('YYYY-MM-DD'),
        },
      };
      if (!_.isUndefined(job.data.minprice) ||
          (+job.data.minprice !== 0) ||
          (!_.isNull(job.data.minprice))) {
        coupon.discount_code['min-price'] = job.data.minprice;
      }
      if (_.isUndefined(job.data.actclient) || (job.data.actclient === '')) {
        coupon.discount_code.act_once_for_client = '0';
      } else {
        coupon.discount_code.act_once_for_client = '1';
      }
      insales.createCoupon({
        token: app.token,
        url: app.insalesurl,
        coupon,
      }).then(data => {
        const _coupon = data.data;
        const coup = new Coupons({
          insalesid           : job.data.id,
          guid                : _coupon['discount-code'].id,
          code                : _coupon['discount-code'].code,
          description         : _coupon['discount-code'].description,
          act                 : _coupon['discount-code']['act-once'],
          actclient           : _coupon['discount-code']['act-once-for-client'],
          typeid              : _coupon['discount-code']['type-id'],
          discount            : _coupon['discount-code'].discount,
          minprice            : _coupon['discount-code']['min-price'],
          worked              : _coupon['discount-code'].worked,
          discountcollections : 'Все',
          expired_at          : _coupon['discount-code']['expired-at'],
          created_at          : _coupon['discount-code']['created-at'],
          updated_at          : _coupon['discount-code']['updated-at'],
          disabled            : _coupon['discount-code'].disabled,
        });
        coup.save(err => {
          if (err) {
            log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
            done(err);
          } else {
            log.info(`Магазин id=${job.data.id} Создан купон id=${_coupon['discount-code'].id}`);
            done();
          }
        });
      }).catch(err => {
        if (err.response.statusCode === 401) {
          createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
          createJobDisableApp(job.data.taskid);
          done();
        } else if (err.response.statusCode === 503) {
          createJobUpdateTimeTask(job.data.taskid);
          const _timeout = +err.response.headers['retry-after'] || 100;
          ctx.pause(5000, err => {
            if (err) {
              log.error(`Магазин id=${job.data.id} Ошибка паузы заданий. ${err}`);
            } else {
              log.warn(`Магазин id=${job.data.id} Лимит API, встаём на паузу`);
              setTimeout(() => {
                ctx.resume();
              }, _timeout * 1000);
            }
          });
        } else {
          log.error(`${err.type}\n${err.url}\n${err.response.req.method} ${err.response.req.path}\n${JSON.stringify(err.msg)}`);
          done();
        }
      });
    } else {
      log.warn(`ShopId=${job.data.id} App not installed to this shop`);
      createJobCloseTask(job.data.taskid, 'Приложение не установлено для данного магазина');
      done();
    }
  });
}

function createExportFile(job) {
  Apps.findOne({
    insalesid: job.data.id,
  }, (err, app) => {
    if (app.enabled === true) {
      const wb = new xl.WorkBook();
      const ws = wb.WorkSheet('Купоны');
      const headerStyle = new rowStyle(wb, true, false, true);
      const rowOddStyle = new rowStyle(wb, true, false, false);
      const rowOddStyleMiddle = new rowStyle(wb, true, true, false);
      const rowEvenStyle = new rowStyle(wb, false, false, false);
      const rowEvenStyleMiddle = new rowStyle(wb, false, true, false);
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
      ws.Cell(1, 1).String('Код купона').Style(headerStyle);
      ws.Cell(1, 2).String('Тип купона').Style(headerStyle);
      ws.Cell(1, 3).String('Тип скидки').Style(headerStyle);
      ws.Cell(1, 4).String('Величина скидки').Style(headerStyle);
      ws.Cell(1, 5).String('Описание').Style(headerStyle);
      ws.Cell(1, 6).String('Группа категорий').Style(headerStyle);
      ws.Cell(1, 7).String('Минимальная сумма заказа').Style(headerStyle);
      ws.Cell(1, 8).String('Один раз для каждого клиента').Style(headerStyle);
      ws.Cell(1, 9).String('Действителен по').Style(headerStyle);
      ws.Cell(1, 10).String('Заблокирован').Style(headerStyle);
      ws.Cell(1, 11).String('Использован').Style(headerStyle);
      Coupons.find({
        insalesid: job.data.id,
      }, (err, coupons) => {
        if (_.isEmpty(coupons)) {
          createJobCloseTask(job.data.taskid, 'Отсутствуют купоны в базе приложения');
        } else {
          let i = 2;
          as.each(coupons, (coup, callback) => {
            const typeDiscount = ((+coup.typeid === 1) ? 'процент' : 'денежная величина');
            const minprice = ((coup.minprice === null) ? ' ' : coup.minprice.toFixed(1));
            const act = ((+coup.act === 1) ? 'одноразовый' : 'многоразовый');
            const actclient = ((+coup.actclient === 1) ? 'да' : 'нет');
            const expired = moment(new Date(coup.expired_at)).format('DD-MM-YYYY');
            let worked = ' ';
            if ((+coup.disabled === 0) && (+coup.worked === 0)) {
              worked = 'да';
            } else if ((+coup.disabled === 0) && (+coup.worked === 1)) {
              worked = 'нет';
            }
            const disabled = ((+coup.disabled === 1) ? 'да' : 'нет');
            ws.Row(i).Height(20);
            ws.Cell(i, 1)
              .String(coup.code)
              .Style((isEven(i)) ? rowEvenStyle : rowOddStyle);
            ws.Cell(i, 2)
              .String(act)
              .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
            ws.Cell(i, 3)
              .String(typeDiscount)
              .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
            ws.Cell(i, 4)
              .Number(+coup.discount)
              .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
            ws.Cell(i, 5)
              .String(coup.description)
              .Style((isEven(i)) ? rowEvenStyle : rowOddStyle);
            ws.Cell(i, 6)
              .String(coup.discountcollections)
              .Style((isEven(i)) ? rowEvenStyle : rowOddStyle);
            ws.Cell(i, 7)
              .Number(+minprice)
              .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
            ws.Cell(i, 8)
              .String(actclient)
              .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
            ws.Cell(i, 9)
              .String(expired)
              .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
            ws.Cell(i, 10)
              .String(disabled)
              .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
            ws.Cell(i, 11)
              .String(worked)
              .Style((isEven(i)) ? rowEvenStyleMiddle : rowOddStyleMiddle);
            i++;
            callback();
          }, e => {
            if (e) {
              log.error(`Магазин id=${job.data.id} Ошибка: ${e}`);
            } else {
              log.info(`Магазин id=${job.data.id} Записываем xlsx файл`);
              const path = `${__dirname}/public/files/${job.data.id}`;
              fs.exists(path, exists => {
                if (exists) {
                  wb.write(`${path}/coupons.xlsx`, err => {
                    if (err) {
                      log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                    } else {
                      createJobCloseTask(job.data.taskid);
                    }
                  });
                } else {
                  fs.mkdir(path, err => {
                    if (err) {
                      log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                    } else {
                      wb.write(`${path}/coupons.xlsx`, err => {
                        if (err) {
                          log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
                        } else {
                          log.info(`Магазин id=${job.data.id} Файл успешно создан`);
                          createJobCloseTask(job.data.taskid);
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
      log.warn(`Приложение не установлено для данного магазина`);
    }
  });
}

function createJobCloseTask(taskid, message) {
  log.info(`Создаём задание на зыкрытие`);
  log.info(taskid);
  if (_.isUndefined(message)) {
    queue.create('inSales', {
      taskid,
      message: undefined,
      taskType: 10,
    }).attempts(3)
      .priority('normal')
      .removeOnComplete(true)
      .ttl(2000)
      .save();
  } else {
    queue.create('inSales', {
      taskid,
      message,
      taskType: 10,
    }).attempts(3)
      .priority('normal')
      .removeOnComplete(true)
      .ttl(2000)
      .save();
  }
}

function closeTask(taskid, message, done) {
  log.info('Закрываем задание');
  Tasks.findById(taskid, (err, t) => {
    const _task = t;
    _task.status = 3;
    _task.updated_at = new Date();
    if (!_.isUndefined(message)) {
      _task.message = message;
    }
    if ((_.isUndefined(message)) && (_task.type === 8)) {
      _task.file = 1;
    }
    _task.save(err => {
      if (err) {
        log.error(`Магазин id=${_task.insalesid} Ошибка: ${err}`);
        createJobCloseTask(taskid, message);
        done();
      } else {
        log.info(`Магазин id=${_task.insalesid} Задание успешно закрыто`);
        done();
      }
    });
  });
}

function createJobSync(job, done) {
  // после установки первое задание на синхронизации
  log.info(`Магазин id=${job.data.id} После установки первое задание на синхронизации`);
  const T = new Tasks({
    insalesid: job.data.id,
    type: 5,
    status: 1,
    created_at : new Date(),
    updated_at : new Date(),
  });
  T.save(err => {
    if (err) {
      log.error(`Магазин id=${job.data.id} Ошибка: ${err}`);
      done();
    } else {
      log.info(`Магазин id=${job.data.id} Создано задание на синхронизацию после установки`);
      done();
    }
  });
}

function createJobDisableApp(insales) {
  log.info(`ShopId=${insales} Task to disable app`);
  queue.create('inSales', {
    id: insales,
    taskType: 11,
  }).attempts(3)
    .priority('normal')
    .removeOnComplete(true)
    .ttl(2000)
    .save();
}

function disableTask(insales, done) {
  Apps.findOne({
    insalesid: insales,
  }, (err, a) => {
    const _app = a;
    _app.enabled = false;
    _app.save(err => {
      if (err) {
        log.error(`ShopId=${insales} Error: ${err}`);
        done(err);
      } else {
        log.info(`ShopId=${insales} Disabled`);
        done();
      }
    });
  });
}

function createJobUpdateTimeTask(taskid) {
  log.info(`TaskId=${taskid} Create task to update time task`);
  queue.create('inSales', {
    taskid,
    taskType: 12,
  }).attempts(3)
    .priority('normal')
    .removeOnComplete(true)
    .ttl(2000)
    .save();
}

function updateTimeTask(taskid, done) {
  log.info(`TaskId=${taskid} Update time task`);
  Tasks.findById(taskid, (err, t) => {
    if (err) {
      log.error(`Error: ${err}`);
      done(err);
    } else {
      const _task = t;
      _task.updated_at = new Date();
      _task.save(err => {
        if (err) {
          log.error(`ShopId=${_task.insalesid} Error: ${err}`);
          done(err);
        } else {
          log.info(`ShopId=${_task.insalesid} Task update time success`);
          done();
        }
      });
    }
  });
}

queue.process('inSales', 1, (job, ctx, done) => {
  const domain = require('domain').create();
  domain.on('error', err => {
    done(err);
  });
  domain.run(() => {
    switch (job.data.taskType) {
      case 1:
        // обрабатываем полученные свойства товара
        createJobSync(job, done);
        break;
      case 2:
        // удаляем купоны из базы приложения
        deleteCouponsFromApp(job, done);
        break;
      case 3:
        // удаляем категорий из базы приложения
        deleteCollectionsFromApp(job, done);
        break;
      case 4:
        // достаём категории из магазина
        getCollections(job, ctx, done);
        break;
      case 5:
        // удаляем купоны из магазина
        if (job.data.couponid === undefined) {
          if (job.data.type === 6) {
            createJobCloseTask(job.data.taskid);
            done();
          } else {
            createJobCreateCoupons(job);
            done();
          }
        } else {
          deleteCoupons(job, ctx, done);
        }
        break;
      case 6:
        // достаём купоны из магазина
        getCouponsFromShop(job, ctx, done);
        break;
      case 7:
        // информация купона из магазина getCoupon
        getCouponFromShop(job, ctx, done);
        break;
      case 8:
        // создаём купоны create
        createCoupons(job, ctx, done);
        break;
      case 9:
        // обновляем купоны update
        updateCoupon(job, ctx, done);
        break;
      case 10:
        // создаём купоны close
        closeTask(job.data.taskid, job.data.message, done);
        break;
      case 11:
        // отключаем приложение
        disableTask(job.data.id, done);
        break;
      case 12:
        // обновляем время у задания
        updateTimeTask(job.data.taskid, done);
        break;
      default:
        done();
    }
  });
});

mongoose.connect(`mongodb://${process.env.mongo}/coupons`);
