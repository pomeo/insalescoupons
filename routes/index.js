var express    = require('express'),
    router     = express.Router(),
    winston    = require('winston'),
    logger     = new (winston.Logger)({
      transports: [
        new (winston.transports.Console)()
      ]
    }),
    debugOn    = true;

/* GET home page. */
router.get('/', function(req, res) {
  res.render('index', { title: 'Express' });
});

module.exports = router;

//Логгер в одном месте, для упрощения перезда на любой логгер.
function log(logMsg) {
  if (logMsg instanceof Error) logger.error(logMsg.stack);
  if (debugOn) {
      logger.info(logMsg);
  }
};
