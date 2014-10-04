var express     = require('express'),
    router      = express.Router(),
    mongoose    = require('mongoose'),
    Schema      = mongoose.Schema,
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