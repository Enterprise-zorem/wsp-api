const { Client, MessageMedia } = require('whatsapp-web.js');
const express = require('express');
const { body, validationResult } = require('express-validator');
const socketIO = require('socket.io');
const qrcode = require('qrcode');
const http = require('http');
const fs = require('fs');
const { phoneNumberFormatter } = require('./helpers/formatter');
const fileUpload = require('express-fileupload');
const axios = require('axios');
const mysql=require('mysql');
const bodyParser=require('body-parser');
const port = process.env.PORT || 8000;

const app = express();
const server = http.createServer(app);
const io = socketIO(server,{
  "transports": ['websocket']
});

app.use(bodyParser.json());

app.use(express.json());
app.use(express.urlencoded({
  extended: true
}));
app.use(fileUpload({
  debug: true
}));


//Mysql
const connection=mysql.createConnection({
  host:'us-cdbr-east-04.cleardb.com',
  user: 'bea5bc766a235d',
  password:'48d8419d',
  database:'heroku_011a19c254b3fbf'
});

setInterval(function () {
  connection.query('SELECT 1');
}, 5000);

const SESSION_FILE_PATH = './whatsapp-session.json';
let sessionCfg;
if (fs.existsSync(SESSION_FILE_PATH)) {
  sessionCfg = require(SESSION_FILE_PATH);
}

app.get('/', (req, res) => {
  res.sendFile('index.html', {
    root: __dirname
  });
});

//get all respondent
app.get('/respondent',(req,res)=>{
  const sql="SELECT * FROM respondent";

  connection.query(sql,(error,results)=>{
      if(error) throw error;
      if(results.length > 0)
      {
          res.json(results);
      }
      else
      {
          res.send("No hay datos disponibles");
      }
  });

});


//get respondent by id
app.get('/respondent/:id',(req,res)=>{
  const {id} = req.params;
  const sql = `SELECT * FROM respondent WHERE id=${id}`;
  connection.query(sql,(error,results)=>{
      if(error) throw error;
      if(results.length>0)
      {
          res.json(results[0].id);
      }
      else
      {
          res.send("Not Found");
      }
  });
});

//add
app.post('/add',(req,res)=>{
  const sql = "INSERT INTO respondent SET ?";

  const customerObj={
      param:req.body.param,
      answer:req.body.answer
  };

  connection.query(sql,customerObj,error =>{
      if(error) throw error;
      res.send('Agregado');
  });

});

//update 
app.put('/update/:id',(req,res)=>{
  const {id} = req.params;
  const {param,answer} = req.body;
  const sql=`UPDATE respondent SET param='${param}', answer='${answer}' WHERE id=${id}`;

  connection.query(sql,error => {
      if(error) throw error;
      res.send("Actualizado");
  });
});

//delete 
app.delete('/delete/:id',(req,res)=>{
  const {id} = req.params;
  const sql = `DELETE FROM respondent WHERE id=${id}`;

  connection.query(sql,error=>{
      if(error) throw error;
      res.send("Eliminado");
  });
});

const client = new Client({
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
  session: sessionCfg
});

client.on('message', msg => {
  
  const message = msg.body;
  
  message=message.toLowerCase();

  const sql = `SELECT * FROM respondent WHERE param='${message}'`;
  connection.query(sql,(error,results)=>{
    if(error) throw error;
    if(results.length>0)
    {
        msg.reply(results[0].city);
    }
  });

});

client.initialize();

// Socket IO
io.on('connection', function(socket) {
  socket.emit('message', 'Conectando...');

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit('qr', url);
      socket.emit('message', 'QR obtenido, escanear!');
    });
  });

  client.on('ready', () => {
    socket.emit('ready', 'Whatsapp esta activo!');
    socket.emit('message', 'Whatsapp esta activo!');
  });

  client.on('authenticated', (session) => {
    socket.emit('authenticated', 'Whatsapp esta autentificado!');
    socket.emit('message', 'Whatsapp esta autentificado!');
    console.log('AUTHENTICATED', session);
    sessionCfg = session;
    fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function(err) {
      if (err) {
        console.error(err);
      }
    });
  });

  client.on('auth_failure', function(session) {
    socket.emit('message', 'Error de autenticación, reiniciando ...');
  });

  client.on('disconnected', (reason) => {
    socket.emit('message', 'Whatsapp está desconectado!');
    fs.unlinkSync(SESSION_FILE_PATH, function(err) {
        if(err) return console.log(err);
        console.log('Archivo de sesión eliminado.');
    });
    client.destroy();
    client.initialize();
  });
});


const checkRegisteredNumber = async function(number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}

// Send message
app.post('/send-message-verify', [
  body('number').notEmpty(),
  body('message').notEmpty(),
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

  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'Numero no registrado'
    });
  }

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

// Send message
app.post('/send-message-noverify', [
  body('number').notEmpty(),
  body('message').notEmpty(),
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

  const number = phoneNumberFormatter(req.body.number);
  const message = req.body.message;

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

// Send media
app.post('/send-media', async (req, res) => {
  const number = phoneNumberFormatter(req.body.number);
  const caption = req.body.caption;
  //const fileUrl = req.body.file;

  //const media = MessageMedia.fromFilePath('./image-example.png');
  const file = req.files.file;
  const media = new MessageMedia(file.mimetype, file.data.toString('base64'), file.name);
  /*let mimetype;
  const attachment = await axios.get(fileUrl, {
    responseType: 'arraybuffer'
  }).then(response => {
    mimetype = response.headers['content-type'];
    return response.data.toString('base64');
  });*/

  //const media = new MessageMedia(mimetype, attachment, 'Media');

  client.sendMessage(number, media, {
    caption: caption
  }).then(response => {
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

const findGroupByName = async function(name) {
  const group = await client.getChats().then(chats => {
    return chats.find(chat => 
      chat.isGroup && chat.name.toLowerCase() == name.toLowerCase()
    );
  });
  return group;
}

// Send message to group
// You can use chatID or group name, yea!
app.post('/send-group-message', [
  body('id').custom((value, { req }) => {
    if (!value && !req.body.name) {
      throw new Error('Valor no válido, puede usar `id` o` nombre`');
    }
    return true;
  }),
  body('message').notEmpty(),
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

  let chatId = req.body.id;
  const groupName = req.body.name;
  const message = req.body.message;

  // Find the group by name
  if (!chatId) {
    const group = await findGroupByName(groupName);
    if (!group) {
      return res.status(422).json({
        status: false,
        message: 'No se encontró ningún grupo con nombre: ' + groupName
      });
    }
    chatId = group.id._serialized;
  }

  client.sendMessage(chatId, message).then(response => {
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

// Clearing message on spesific chat
app.post('/clear-message', [
  body('number').notEmpty(),
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

  const number = phoneNumberFormatter(req.body.number);

  const isRegisteredNumber = await checkRegisteredNumber(number);

  if (!isRegisteredNumber) {
    return res.status(422).json({
      status: false,
      message: 'Numero no registrado'
    });
  }

  const chat = await client.getChatById(number);
  
  chat.clearMessages().then(status => {
    res.status(200).json({
      status: true,
      response: status
    });
  }).catch(err => {
    res.status(500).json({
      status: false,
      response: err
    });
  })
});

//check connection
connection.connect(error => {
  if(error) throw error;
  console.log('Database server running');
});

server.listen(port, function() {
  console.log('App running on *: ' + port);
});
