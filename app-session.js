const {
  Client,
  MessageMedia
} = require('whatsapp-web.js');
const express = require('express');
const {
  body,
  validationResult
} = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const {
  phoneNumberFormatter
} = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mysql = require('mysql');
const bodyParser = require('body-parser');
const {
  response
} = require('express');
const {
  json
} = require('body-parser');
const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  "transports": ['websocket']
});

app.use(bodyParser.json());

app.use(function (req, res, next) {

  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Authorization, X-API-KEY, Origin, X-Requested-With, Content-Type, Accept, Access-Control-Allow-Request-Method');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Allow', 'GET, POST, OPTIONS, PUT, DELETE');
  next();

});

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: true
}));


app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

/*
//Mysql
const connection = mysql.createConnection({
  host: 'us-cdbr-east-04.cleardb.com',
  user: 'bea5bc766a235d',
  password: '48d8419d',
  database: 'heroku_011a19c254b3fbf'
});

setInterval(function () {
  connection.query('SELECT 1');
}, 5000);
*/
const SESSION_FILE_PATH = './whatsapp-session.json';


app.post('/send-session', (req, res) => {

  let cfgsession = req.body;

  fs.writeFile(SESSION_FILE_PATH, JSON.stringify(cfgsession), function (err) {
    if (err) {
      res.status(500).json({
        status: false,
        response: err
      });
    } else {
      sessionCfg = require(SESSION_FILE_PATH);
      res.status(200).json({
        status: true,
        response: 'defaultValue'
      });
    }
  });

});

// Send message session
app.post('/send-message', [
  body('number').notEmpty(),
  body('message').notEmpty(),
  body('session').notEmpty()
], async (req, res) => {

  //=============================
  const client = await new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
    },
    session: JSON.parse(req.body.session)
  });
  //=============================
  console.log(req.body);
  console.log(client);

  await client.initialize();

  const number = req.body.number;
  const message = req.body.message;
  //const number = '51953982258@c.us';
  //const message = 'Hello World';

  client.sendMessage(number, message).then(response => {
    res.status(200).json({
      status: true,
      response: response
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  });

});


// Send message multiple
app.post('/send-message-multiple-noverify', [
  body('numbers').notEmpty(),
  body('WABrowserId').notEmpty(),
  body('key').notEmpty(),
  body('encKey').notEmpty(),
  body('macKey').notEmpty(),
  body('WAToken1').notEmpty(),
  body('WAToken2').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  //generate session
  let secretbundle = [];
  secretbundle["key"] = req.body.key;
  secretbundle["encKey"] = req.body.encKey;
  secretbundle["macKey"] = req.body.macKey;

  let session_array = [];
  session_array['WABrowserId'] = JSON.stringify(req.body.WABrowserId);
  session_array['WASecretBundle'] = JSON.stringify(Object.assign({}, secretbundle));
  session_array['WAToken1'] = JSON.stringify(req.body.WAToken1);
  session_array['WAToken2'] = JSON.stringify(req.body.WAToken2);

  //=============================
  const client = await new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
    },
    session: Object.assign({}, session_array)
  });
  //=============================

  await client.initialize();

  const numbers = JSON.parse(req.body.numbers);
  const message = JSON.parse(req.body.message);

  //send file
  const caption = req.body.caption;
  let file;
  let media = [];

  if (req.files) {
    file = (Array.isArray(req.files.file)?req.files.file:[req.files.file]).filter(e=>e);
  }

  if (file) {
    file.forEach(index => {
      media.push(new MessageMedia(index.mimetype, index.data.toString('base64'), index.name));
    });
  }

  let results = [];
  numbers.forEach(number => {

    if (file) {
      client.sendMessage(number, message).then(response => {
        results.push(JSON.stringify(response));
      }).catch(err => {
        results.push(JSON.stringify(err));
      });

      media.forEach(index => {

        //send caption 
        client.sendMessage(number, index, {
          caption: caption
        }).then(response => {
          results.push(response);
        }).catch(err => {
          results.push(err);
        });

      });

    } else {
      client.sendMessage(number, message).then(response => {
        results.push(JSON.stringify(response));
      }).catch(err => {
        results.push(JSON.stringify(err));
      });
    }

  });

  console.log(results);

  res.status(200).json({
    status: true,
    response: JSON.stringify(results)
  });

});


// Send message multiple
app.post('/send-message-multiple-verify', [
  body('numbers').notEmpty(),
  body('WABrowserId').notEmpty(),
  body('key').notEmpty(),
  body('encKey').notEmpty(),
  body('macKey').notEmpty(),
  body('WAToken1').notEmpty(),
  body('WAToken2').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req).formatWith(({
    msg
  }) => {
    return msg;
  });

  if (!errors.isEmpty()) {
    return res.status(422).json({
      status: false,
      message: errors.mapped()
    });
  }

  //generate session
  let secretbundle = [];
  secretbundle["key"] = req.body.key;
  secretbundle["encKey"] = req.body.encKey;
  secretbundle["macKey"] = req.body.macKey;

  let session_array = [];
  session_array['WABrowserId'] = JSON.stringify(req.body.WABrowserId);
  session_array['WASecretBundle'] = JSON.stringify(Object.assign({}, secretbundle));
  session_array['WAToken1'] = JSON.stringify(req.body.WAToken1);
  session_array['WAToken2'] = JSON.stringify(req.body.WAToken2);

  //=============================
  const client = await new Client({
    restartOnAuthFail: true,
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ],
    },
    session: Object.assign({}, session_array)
  });
  //=============================
  //console.log(JSON.parse(req.body.session));
  await client.initialize();

  const checkRegisteredNumber = async function (number) {
    const isRegistered = await client.isRegisteredUser(number);
    return isRegistered;
  }

  let isRegisteredNumber;

  const numbers = JSON.parse(req.body.numbers);
  const message = JSON.parse(req.body.message);

  //send file
  const caption = req.body.caption;
  let file;
  let media = [];

  if (req.files) {
    file= (Array.isArray(req.files.file)?req.files.file:[req.files.file]).filter(e=>e);
  }

  if (file) {
    
      file.forEach(index => {
        media.push(new MessageMedia(index.mimetype, index.data.toString('base64'), index.name));
      });
  }

  let results = [];
  numbers.forEach(async (number) => {

    isRegisteredNumber = await checkRegisteredNumber(number);
    if (isRegisteredNumber) {

      if (file) {
        client.sendMessage(number, message).then(response => {
          results.push(response);
        }).catch(err => {
          results.push(err);
        });

        media.forEach(index => {
          //send caption 
          client.sendMessage(number, index, {
            caption: caption
          }).then(response => {
            results.push(response);
          }).catch(err => {
            results.push(err);
          });

        });

      } else {
        client.sendMessage(number, message).then(response => {
          results.push(response);
        }).catch(err => {
          results.push(err);
        });
      }

    }

  });

  res.status(200).json({
    status: true,
    response: JSON.stringify(results)
  });

});

/*
//get session
app.get('/get-session', (req, res) => {

  const sql = "SELECT * FROM sessions where id=5";

  connection.query(sql, (error, results) => {
    if (error) throw error;
    if (results.length > 0) {
      res.json(results[0].sessioncfg);
    } else {
      res.send("No hay datos disponibles");
    }
  });

});
*/

server.listen(port, function () {
  console.log('App running on *: ' + port);
});