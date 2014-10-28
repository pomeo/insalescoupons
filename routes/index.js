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

router.get('/', function(req, res) {
  res.render('index', { title: '' });
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

var SettingsSchema = new Schema();

SettingsSchema.add({
  property    : { type: String, index: true },
  value       : String,
  created_at  : Date,
  updated_at  : Date
});

var CouponsSchema = new Schema();

CouponsSchema.add({
  guid        : { type: Number, index: true },
  сode        : String,
  description : String,
  typeid      : Number,
  discount    : Number,
  expired_at  : Date,
  created_at  : Date,
  updated_at  : Date,
  enabled     : Boolean
});

var AppsSchema = new Schema();

AppsSchema.add({
  insalesid   : { type: String, unique: true },
  insalesurl  : String,
  token       : String,
  autologin   : String,
  settings    : [SettingsSchema],
  created_at  : Date,
  updated_at  : Date,
  enabled     : Boolean
});

var Coupons = mongoose.model('Coupons', CouponsSchema);
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