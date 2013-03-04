var express = require('express'),
    hbs = require('hbs'),
    app = express();

var redis = require('redis'),
    pubClient = redis.createClient(11950, 'pub-redis-11950.us-east-1-2.2.ec2.garantiadata.com');


pubClient.auth('123123123');

////////////////////////////////////////////////
// Express Configuration
////////////////////////////////////////////////
app.configure(function() {
  app.set('port', process.argv[2] || process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'hbs');
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'), { maxAge: 300000 });
});

app.configure('development', function(){
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

////////////////////////////////////////////////
// Handlebars
////////////////////////////////////////////////
var blocks = {};

hbs.registerHelper('extend', function(name, context) {
    var block = blocks[name];
    if (!block) {
        block = blocks[name] = [];
    }

    block.push(context(this));
});

hbs.registerHelper('block', function(name) {
    var val = (blocks[name] || []).join('\n');

    // clear the block
    blocks[name] = [];
    return val;
});

////////////////////////////////////////////////
// Router
////////////////////////////////////////////////
app.get('/', function(req, res) {
  res.render('index');
});

app.get('/c/:channel', function (req, res) {
  res.locals.channel = req.param('channel');
  res.render('channel');
});

app.get('/s/:channel', function (req, res) {
  req.socket.setTimeout(Infinity);

  var messageCount = 0;
  var subscriber = redis.createClient(11950, 'pub-redis-11950.us-east-1-2.2.ec2.garantiadata.com');
  subscriber.auth('123123123');

  subscriber.subscribe(req.param('channel'));

  // In case we encounter an error...print it out to the console
  subscriber.on("error", function(err) {
    console.log("Redis Error: " + err);
  });

  // When we receive a message from the redis connection
  subscriber.on("message", function(channel, message) {
    messageCount++; // Increment our message count

    res.write('id: ' + messageCount + '\n');
    res.write("data: " + message + '\n\n'); // Note the extra newline
  });

  //send headers for event-stream connection
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.write('\n');

  // The 'close' event is fired when a user closes their browser window.
  // In that situation we want to make sure our redis channel subscription
  // is properly shut down to prevent memory leaks...and incorrect subscriber
  // counts to the channel.
  req.on("close", function() {
    subscriber.unsubscribe();
    subscriber.quit();
  });
});

app.post('/p/:channel', function(req, res) {
  req.param('data');
  req.param(req.body);
  pubClient.publish(req.param('channel'), req.param('data'));
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write('OK');
  res.end();
});

////////////////////////////////////////////////
// Express Server
////////////////////////////////////////////////
app.listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
