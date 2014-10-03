var express     = require('express'),
    router      = express.Router(),
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

/* GET home page. */
router.get('/', function(req, res) {
  log('Test', 'info');
  res.render('index', { title: 'Express' });
});

module.exports = router;

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