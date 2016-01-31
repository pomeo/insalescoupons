'use strict';
const express    = require('express');
const router     = express.Router();
const mongoose   = require('mongoose');
const kue        = require('kue');
const queue      = kue.createQueue({
  disableSearch: true,
  jobEvents: false,
  redis: {
    host: process.env.redis,
  },
});
const push       = require('pushover-notifications');
const P          = new push({
  user: process.env.PUSHOVER_USER,
  token: process.env.PUSHOVER_TOKEN,
});
const crypto     = require('crypto');
const fs         = require('fs');
const moment     = require('moment');
const hat        = require('hat');
const as         = require('async');
const cc         = require('coupon-code');
const _          = require('lodash');
const formidable = require('formidable');
const log        = require('winston-logs')(require('../log'));

const modelsPath = `${__dirname}/../models`;
fs.readdirSync(modelsPath).forEach((file) => {
  if (~file.indexOf('js')) {
    require(`${modelsPath}/${file}`);
  }
});

const Apps     = mongoose.model('Apps');
const Tasks    = mongoose.model('Tasks');
const Settings = mongoose.model('Settings');
const Charges  = mongoose.model('Charges');
const Coupons  = mongoose.model('Coupons');

router.get('/', (req, res) => {
  const _session = req.session;
  if (req.query.token && (req.query.token !== '')) {
    Apps.findOne({
      autologin: req.query.token,
    }, (err, app) => {
      if (app) {
        log.info(`Магазин id=${app.insalesid} Создаём сессию и перебрасываем на главную`);
        _session.insalesid = app.insalesid;
        res.redirect('/');
      } else {
        log.warn(`Ошибка автологина. Неправильный token при переходе из insales`);
        res.render('block', {
          msg: 'Ошибка автологина',
        });
      }
    });
  } else {
    if (process.env.NODE_ENV === 'development') {
      _session.insalesid = 74112;
    }
    const insid = _session.insalesid || req.query.insales_id;
    if ((req.query.insales_id &&
         (req.query.insales_id !== '')) ||
        _session.insalesid !== undefined) {
      Apps.findOne({
        insalesid: insid,
      }, (err, app) => {
        if (app.enabled === true) {
          Settings.find({
            insalesid: insid,
          }, (err, settings) => {
            if (_session.insalesid) {
              const sett = {};
              as.each(settings, (s, callback) => {
                sett[s.property] = s.value;
                callback();
              }, e => {
                if (e) {
                  log.error(`Ошибка во время работы async. Вывод свойств формы генерации в шаблон. Error: ${e}`);
                } else {
                  Charges.findOne({
                    insalesid: req.session.insalesid,
                  }, (err, charge) => {
                    const ch = (_.isNull(charge)) ? false : charge.blocked;
                    if (ch) {
                      res.render('block', {
                        msg: 'Приложение заблокировано за неуплату',
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
                        expired  : typeof sett['coupon-until'] !== 'undefined' ? sett['coupon-until'] : '01.01.2020',
                      });
                    }
                  });
                }
              });
            } else {
              log.info(`Авторизация ${req.query.insales_id}`);
              const id = hat();
              app.autologin = crypto.createHash('md5')
                .update(id + app.token)
                .digest('hex');
              app.save(err => {
                if (err) {
                  res.send(err, 500);
                } else {
                  res.redirect(`http://${app.insalesurl}/admin/applications/${process.env.insalesid}/login?token=${id}&login=https://coupons.salesapps.ru`);
                }
              });
            }
          });
        } else {
          res.render('block', {
            msg: 'Приложение не установлено для данного магазина',
          });
        }
      });
    } else {
      res.render('block', {
        msg: 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти',
      });
    }
  }
});

router.get('/zadaniya', (req, res) => {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid: req.session.insalesid,
    }, (err, app) => {
      if (app.enabled === true) {
        Charges.findOne({
          insalesid: req.session.insalesid,
        }, (err, charge) => {
          const ch = (_.isNull(charge)) ? false : charge.blocked;
          if (ch) {
            res.render('block', {
              msg: 'Приложение заблокировано за неуплату',
            });
          } else {
            const T = Tasks.find({
              insalesid: req.session.insalesid,
            });
            T.sort({
              created_at: -1,
            });
            T.limit(50);
            T.exec((err, tasks) => {
              const tasksList = [];
              const tasksDone = [];
              const tasksProcessing = [];
              as.each(tasks, (task, callback) => {
                if (task.status === 3) {
                  if (_.isUndefined(task.message)) {
                    tasksDone.push({
                      type    : task.type,
                      status  : task.status,
                      numbers : task.numbers,
                      variant : task.variant,
                      file    : task.file,
                      created : new Date(task.created_at),
                      updated : new Date(task.updated_at),
                    });
                    callback();
                  } else {
                    tasksDone.push({
                      type    : task.type,
                      status  : task.status,
                      numbers : task.numbers,
                      variant : task.variant,
                      message : task.message,
                      created : new Date(task.created_at),
                      updated : new Date(task.updated_at),
                    });
                    callback();
                  }
                } else if (task.status === 2) {
                  tasksProcessing.push({
                    type    : task.type,
                    status  : task.status,
                    numbers : task.numbers,
                    variant : task.variant,
                    created : new Date(task.created_at),
                    updated : new Date(task.updated_at),
                  });
                  callback();
                } else {
                  tasksList.push({
                    type    : task.type,
                    status  : task.status,
                    numbers : task.numbers,
                    variant : task.variant,
                    created : new Date(task.created_at),
                    updated : new Date(task.updated_at),
                  });
                  callback();
                }
              }, err => {
                res.render('tasks', {
                  _,
                  tasks     : tasksList,
                  done      : tasksDone,
                  processing: tasksProcessing,
                });
              });
            });
          }
        });
      } else {
        res.render('block', {
          msg: 'Приложение не установлено для данного магазина',
        });
      }
    });
  } else {
    res.render('block', {
      msg: 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти',
    });
  }
});

router.post('/input', (req, res) => {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid: req.session.insalesid,
    }, (err, app) => {
      if (app.enabled === true) {
        if (+req.body.data === 1) {
          // синхронизация
          const T = new Tasks({
            insalesid: req.session.insalesid,
            type: 5,
            status: 1,
            count: 0,
            created_at: new Date(),
            updated_at: new Date(),
          });
          T.save(err => {
            if (err) {
              log.error(`Магазин id=${req.session.insalesid} Ошибка: ${err}`);
              res.status(403).send('ошибка');
            } else {
              res.status(200).send('success');
            }
          });
        } else if (+req.body.data === 2) {
          // синхронизация
          const T = new Tasks({
            insalesid: req.session.insalesid,
            type: 8,
            status: 1,
            file: 0,
            count: 0,
            created_at : new Date(),
            updated_at : new Date(),
          });
          T.save(err => {
            if (err) {
              log.error(`Магазин id=${req.session.insalesid} Ошибка: ${err}`);
              res.status(403).send('ошибка');
            } else {
              res.status(200).send('success');
            }
          });
        } else if (req.body.variants) {
          // удаление
          const T = new Tasks({
            insalesid: req.session.insalesid,
            type: 6,
            status: 1,
            variant: +req.body.variants,
            count: 0,
            created_at: new Date(),
            updated_at: new Date(),
          });
          T.save(err => {
            if (err) {
              log.error(`Магазин id=${req.session.insalesid} Ошибка: ${err}`);
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
          msg: 'Приложение не установлено для данного магазина',
        });
      }
    });
  } else {
    res.render('block', {
      msg: 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти',
    });
  }
});

router.get('/import-export', (req, res) => {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid: req.session.insalesid,
    }, (err, app) => {
      if (app.enabled === true) {
        Charges.findOne({
          insalesid: req.session.insalesid,
        }, (err, charge) => {
          const ch = (_.isNull(charge)) ? false : charge.blocked;
          if (ch) {
            res.render('block', {
              msg: 'Приложение заблокировано за неуплату',
            });
          } else {
            res.render('io');
          }
        });
      } else {
        res.render('block', {
          msg: 'Приложение не установлено для данного магазина',
        });
      }
    });
  } else {
    res.render('block', {
      msg: 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти',
    });
  }
});

router.post('/import', (req, res) => {
  if (req.session.insalesid) {
    const form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.on('error', (err) => {
      log.error(`Магазин id=${req.session.insalesid} Ошибка: ${err}`);
    });

    form.on('end', () => {
      res.send('ok');
    });

    form.parse(req, (err, fields, files) => {
      const T = new Tasks({
        insalesid: req.session.insalesid,
        type: 7,
        status: 1,
        path: files['files[]'].path,
        count: 0,
        created_at : new Date(),
        updated_at : new Date(),
      });
      T.save(err => {
        if (err) {
          log.error(`Магазин id=${req.session.insalesid} Ошибка: ${err}`);
        } else {
          log.info('Done');
        }
      });
    });
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
  }
});

router.get('/export', (req, res) => {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid: req.session.insalesid,
    }, (err, app) => {
      if (app.enabled === true) {
        const path = `${__dirname}/../public/files/${req.session.insalesid}/coupons.xlsx`;
        fs.exists(path, exists => {
          if (exists) {
            const stat = fs.statSync(path);
            res.writeHead(200, {
              'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'Content-Length': stat.size,
              'Content-Disposition': 'attachment; filename=coupons.xlsx',
            });
            const readStream = fs.createReadStream(path);
            readStream.on('open', () => {
              readStream.pipe(res);
            });
            readStream.on('error', err => {
              log.error(`Магазин id=${req.session.insalesid} Ошибка: ${err}`);
              res.status(500).send('Произошла ошибка');
            });
          } else {
            res.status(200).send('Файл отсуствует');
          }
        });
      } else {
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    });
  } else {
    res.status(403).send('Вход возможен только из панели администратора insales -> приложения -> установленные -> войти');
  }
});

router.get('/opisanie', (req, res) => {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid: req.session.insalesid,
    }, (err, app) => {
      if (app.enabled === true) {
        Charges.findOne({
          insalesid: req.session.insalesid,
        }, (err, charge) => {
          const ch = (_.isNull(charge)) ? false : charge.blocked;
          if (ch) {
            res.render('block', {
              msg: 'Приложение заблокировано за неуплату',
            });
          } else {
            res.render('desc');
          }
        });
      } else {
        res.render('block', {
          msg: 'Приложение не установлено для данного магазина',
        });
      }
    });
  } else {
    res.render('block', {
      msg: 'Вход возможен только из панели администратора insales.ru <span class="uk-icon-long-arrow-right"></span> приложения <span class="uk-icon-long-arrow-right"></span> установленные <span class="uk-icon-long-arrow-right"></span> войти',
    });
  }
});

router.post('/generate', (req, res) => {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid:req.session.insalesid,
    }, (err, app) => {
      if (app.enabled === true) {
        const form = {
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
        const exist = {
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
            insalesid: req.session.insalesid,
          }, (err, settings) => {
            as.each(settings, (s, callback) => {
              const _setting = s;
              _setting.value = form[s.property];
              _setting.updated_at = new Date();
              _setting.save(err => {
                if (err) {
                  log.error(`Магазин id=${req.session.insalesid} Ошибка: ${err}`);
                  callback();
                } else {
                  exist[s.property] = 1;
                  callback();
                }
              });
            }, e => {
              if (e) {
                log.error(`Магазин id=${req.session.insalesid} Ошибка: ${e}`);
              } else {
                for (let prop in exist) {
                  if (exist[prop] === -1) {
                    const sett = new Settings({
                      insalesid   : req.session.insalesid,
                      property    : prop,
                      value       : form[prop],
                      created_at  : new Date(),
                      updated_at  : new Date(),
                    });
                    sett.save(err => {
                      if (err) {
                        log.error(`Магазин id=${req.session.insalesid} Ошибка: ${err}`);
                      } else {
                        log.info(`Магазин id=${req.session.insalesid} Поля формы сохранены в базу приложения`);
                      }
                    });
                  }
                }
                const T = new Tasks({
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
                  updated_at : new Date(),
                });
                T.save(err => {
                  if (err) {
                    log.error(`Магазин id=${req.session.insalesid} Ошибка: ${err}`);
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
});

router.get('/sample', (req, res) => {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid: req.session.insalesid,
    }, (err, app) => {
      if (app.enabled === true) {
        const p = parseInt(req.query.parts);
        const l = parseInt(req.query.length);
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
});

router.get('/id', (req, res) => {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid: req.session.insalesid,
    }, (err, app) => {
      if (app.enabled === true) {
        res.send(`Ваш id: ${req.session.insalesid}`);
      } else {
        res.status(403).send('Приложение не установлено для данного магазина');
      }
    });
  } else {
    res.status(403).send('Сначала необходимо войти из панели администратора insales -> приложения -> установленные -> войти');
  }
});

router.get('/data', (req, res) => {
  if (req.session.insalesid) {
    Apps.findOne({
      insalesid: req.session.insalesid,
    }, (err, app) => {
      if (app.enabled === true) {
        const data = [];
        Coupons.find({
          insalesid: req.session.insalesid,
        }, (err, coupons) => {
          let i = 0;
          as.each(coupons, (coup, callback) => {
            const typeDiscount = ((coup.typeid === 1) ? ' %' : ' руб');
            // const minprice = ((coup.minprice === null) ? ' ' : coup.minprice);
            const act = ((coup.act === true) ? 'одноразовый' : 'многоразовый');
            // const actclient = ((coup.act === 1) ? 'да' : 'нет');
            const expired = moment(new Date(coup.expired_at))
                  .format('DD-MM-YYYY');
            let worked = ' ';
            if ((coup.disabled === false) && (coup.worked === false)) {
              worked = 'да';
            } else if ((coup.disabled === false) && (coup.worked === true)) {
              worked = 'нет';
            }
            const disabled = ((coup.disabled === true) ? 'да' : 'нет');
            data[i] = {
              code: coup.code,
              type: act,
              typeid: coup.act,
              coll: coup.discountcollections,
              disc: coup.discount + typeDiscount,
              expired,
              disabled,
              worked,
            };
            i++;
            callback();
          }, e => {
            if (e) {
              log.error(`Магазин id=${req.session.insalesid} Ошибка: ${e}`);
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

router.get('/install', (req, res) => {
  if ((req.query.shop !== '') &&
      (req.query.token !== '') &&
      (req.query.insales_id !== '') &&
      req.query.shop &&
      req.query.token &&
      req.query.insales_id) {
    Apps.findOne({
      insalesid: req.query.insales_id,
    }, (err, a) => {
      if (a === null) {
        const app = new Apps({
          insalesid  : req.query.insales_id,
          insalesurl : req.query.shop,
          token      : crypto.createHash('md5')
                       .update(req.query.token + process.env.insalessecret)
                       .digest('hex'),
          created_at : moment().format('ddd, DD MMM YYYY HH:mm:ss ZZ'),
          updated_at : moment().format('ddd, DD MMM YYYY HH:mm:ss ZZ'),
          enabled    : true,
        });
        app.save(err => {
          if (err) {
            log.error(`Магазин id=${req.query.insales_id} Ошибка: ${err}`);
            res.status(500).send({
              error: err,
            });
          } else {
            log.info(`Магазин id=${req.query.insales_id} Установлен`);
            res.sendStatus(200);
            queue.create('inSales', {
              id: req.query.insales_id,
              taskType: 1,
            }).attempts(3)
              .priority('normal')
              .removeOnComplete(true)
              .ttl(2000)
              .save();
            log.info(`Магазин id=${req.query.insales_id} После установки отправка задания в очередь на синхронизацию`);
            log.info(`Магазин id=${req.query.insales_id} После установки отправка задания в очередь на проверку оплаты`);
            const msg = {
              message: '+1 установка',
              title: 'Генератор купонов',
            };
            P.send(msg, (err, result) => {
              if (err) {
                log.error(err);
              } else {
                log.info(result);
              }
            });
          }
        });
      } else {
        if (a.enabled === true) {
          res.status(403).send('Приложение уже установленно');
        } else {
          const _app = a;
          _app.token = crypto.createHash('md5')
            .update(req.query.token + process.env.insalessecret)
            .digest('hex');
          _app.updated_at = moment().format('ddd, DD MMM YYYY HH:mm:ss ZZ');
          _app.enabled = true;
          _app.save(err => {
            if (err) {
              log.error(`Магазин id=${req.query.insales_id} Ошибка: ${err}`);
              res.status(500).send({
                error: err,
              });
            } else {
              log.info(`Магазин id=${req.query.insales_id} Установлен`);
              res.sendStatus(200);
              queue.create('inSales', {
                id: _app.insalesid,
                taskType: 1,
              }).attempts(3)
                .priority('normal')
                .removeOnComplete(true)
                .ttl(2000)
                .save();
              log.info(`Магазин id=${req.query.insales_id} После установки отправка задания в очередь на синхронизацию`);
              log.info(`Магазин id=${req.query.insales_id} После установки отправка задания в очередь на проверку оплаты`);
              const msg = {
                message: '+1 установка',
                title: 'Генератор купонов',
              };
              P.send(msg, (err, result) => {
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

router.get('/uninstall', (req, res) => {
  if ((req.query.shop !== '') &&
      (req.query.token !== '') &&
      (req.query.insales_id !== '') &&
      req.query.shop &&
      req.query.token &&
      req.query.insales_id) {
    Apps.findOne({
      insalesid: req.query.insales_id,
    }, (err, a) => {
      const _app = a;
      if (a.token === req.query.token) {
        _app.updated_at = moment().format('ddd, DD MMM YYYY HH:mm:ss ZZ');
        _app.enabled = false;
        _app.save(err => {
          if (err) {
            log.error(`Магазин id=${req.query.insales_id} Ошибка: ${err}`);
            res.status(500).send({ error: err });
          } else {
            log.info(`Магазин id=${req.query.insales_id} Удалён`);
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

mongoose.connect(`mongodb://${process.env.mongo}/coupons`);
