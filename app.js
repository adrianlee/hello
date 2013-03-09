var express = require('express'),
  hbs = require('hbs'),
  app = express();

var redis = require('redis'),
  pubClient = redis.createClient();

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
  app.use(express.static(__dirname + '/public'), {
    maxAge: 300000
  });
});

app.configure('development', function() {
  app.use(express.errorHandler({
    dumpExceptions: true,
    showStack: true
  }));
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

app.get('/health', function(req, res) {
  pubClient.info(function(err, reply) {
    res.send(reply);
  });
});

app.get('/o/:channel', function(req, res) {
  pubClient.lrange(req.param('channel'), 0, -1, function(err, reply) {
    console.log(reply);
    res.json(reply);
  });
});

app.get('/s/:channel', function(req, res) {
  req.socket.setTimeout(Infinity);

  var messageCount = 0;
  var subscriber = redis.createClient();

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
  pubClient.lpush(req.param('channel'), JSON.stringify(req.body))
  pubClient.ltrim(req.param('channel'), 0, 9);

  console.log(req.body);

  pubClient.publish(req.param('channel'), JSON.stringify(req.body));
  res.writeHead(200, {
    'Content-Type': 'text/html'
  });
  res.end();
});

app.get('/:channel', function(req, res) {
  res.locals.channel = req.param('channel');
  res.render('channel');
});

////////////////////////////////////////////////
// Express Server
////////////////////////////////////////////////
app.listen(app.get('port'), function() {
  console.log("Express server listening on port " + app.get('port'));
});