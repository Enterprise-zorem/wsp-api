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
const { group } = require('console');
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

//Mysql
//hello world

const connection = mysql.createConnection({
  host: 'us-cdbr-east-04.cleardb.com',
  user: 'bea5bc766a235d',
  password: '48d8419d',
  database: 'heroku_011a19c254b3fbf'
});

setInterval(function () {
  connection.query('SELECT 1');
}, 5000);

//Mysql


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
app.get('/respondent', (req, res) => {
  const sql = "SELECT * FROM respondent";

  connection.query(sql, (error, results) => {
    if (error) throw error;
    if (results.length > 0) {
      res.json(results);
    } else {
      res.send("No hay datos disponibles");
    }
  });

});

//get respondent by id
app.get('/respondent/:id', (req, res) => {
  const {
    id
  } = req.params;
  const sql = `SELECT * FROM respondent WHERE id=${id}`;
  connection.query(sql, (error, results) => {
    if (error) throw error;
    if (results.length > 0) {
      res.json(results[0].id);
    } else {
      res.send("Not Found");
    }
  });
});

//add
app.post('/add', (req, res) => {
  const sql = "INSERT INTO respondent SET ?";

  const customerObj = {
    param: req.body.param,
    answer: req.body.answer
  };

  connection.query(sql, customerObj, error => {
    if (error) throw error;
    res.send('Agregado');
  });

});

//update 
app.put('/update/:id', (req, res) => {
  const {
    id
  } = req.params;
  const {
    param,
    answer,
    is_active
  } = req.body;
  const sql = `UPDATE respondent SET param='${param}', answer='${answer}', is_active='${is_active}' WHERE id=${id}`;

  connection.query(sql, error => {
    if (error) throw error;
    res.send("Actualizado");
  });
});

//delete 
app.delete('/delete/:id', (req, res) => {
  const {
    id
  } = req.params;
  const sql = `DELETE FROM respondent WHERE id=${id}`;

  connection.query(sql, error => {
    if (error) throw error;
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

  const message = msg.body.toLowerCase();

  const sql = `SELECT * FROM respondent WHERE param='${message}' and is_active=1`;
  connection.query(sql, (error, results) => {
    if (error) throw error;
    if (results.length > 0) {
      msg.reply(results[0].answer);
    }
  });

  if (msg.body == '!ping') {
    msg.reply('pong');
  }

});

client.initialize();

// Socket IO
io.on('connection', function (socket) {

  (async () => {

    socket.emit('message', 'Conectando...');
    try {

      let result = await client.getState();
      if (result === "CONNECTED") {
        socket.emit('ready', 'Whatsapp esta activo!');
        socket.emit('message', 'Whatsapp esta activo!');
      }

    } catch (error) {
      if (fs.existsSync(SESSION_FILE_PATH)) {
        fs.unlinkSync(SESSION_FILE_PATH, function (err) {
          if (err) return console.log(err);
          console.log('Archivo de sesión eliminado.');
        });
        client.destroy();
        client.initialize();
      }

    }

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
      fs.writeFile(SESSION_FILE_PATH, JSON.stringify(session), function (err) {
        if (err) {
          console.error(err);
        }
      });
    });

    client.on('auth_failure', function (session) {
      socket.emit('message', 'Error de autenticación, reiniciando ...');
      if (fs.existsSync(SESSION_FILE_PATH)) {
        fs.unlinkSync(SESSION_FILE_PATH, function (err) {
          if (err) return console.log(err);
          console.log('Archivo de sesión eliminado.');
        });
      }

    });

    client.on('disconnected', (reason) => {
      socket.emit('message', 'Whatsapp está desconectado!');
      if (fs.existsSync(SESSION_FILE_PATH)) {
        fs.unlinkSync(SESSION_FILE_PATH, function (err) {
          if (err) return console.log(err);
          console.log('Archivo de sesión eliminado.');
        });
        client.destroy();
        client.initialize();
      }
    });

  })();

});


const checkRegisteredNumber = async function (number) {
  const isRegistered = await client.isRegisteredUser(number);
  return isRegistered;
}


// Send message multiple
app.post('/send-message-multiple', [
  body('numbers').notEmpty(),
  body('message').notEmpty(),
  body('type').notEmpty(),
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

  const numbers = JSON.parse(req.body.numbers);
  const message = JSON.parse(req.body.message);
  const type = req.body.type;
  //const business = req.body.business;

  //send file
  const caption = req.body.caption;
  let file;
  let media = [];
  if (req.files) {
    file = (Array.isArray(req.files.file) ? req.files.file : [req.files.file]).filter(e => e);
  }
  if (file) {
    file.forEach(index => {
      media.push(new MessageMedia(index.mimetype, index.data.toString('base64'), index.name));
    });
  }
  //send file

  let results = [];

  numbers.forEach(async (number) => {

    let number_formated = phoneNumberFormatter(number);
    //verificar que el numero este registrado en wsp
    let is_verify = await checkRegisteredNumber(number_formated);
    if (!is_verify) { //no esta registrado entonces continuar con la sgt interacion
      return
    }

    //verificar
    let contactado;
    try {
      contactado = await client.getContactById(number_formated);
    } catch (error) {
      contactado = false;
    }


    //enviar mensaje a todos
    if(type==="modo_all")
    { console.log("Mensaje Enviado - Sin excepcion:" + number_formated);
      //enviar mensaje
      if (file) {

        client.sendMessage(number_formated, message).then(response => {
          results.push(JSON.stringify(response));
        }).catch(err => {
          results.push(JSON.stringify(err));
        });
        media.forEach(index => {
          client.sendMessage(number_formated, index, {
            caption: caption
          }).then(response => {
            results.push(response);
          }).catch(err => {
            results.push(err);
          });
        });

      } else {

        client.sendMessage(number_formated, message).then(response => {
          results.push(response);
        }).catch(err => {
          results.push(err);
        });

      }
      //end enviar mensaje
    }
    else if (type === "modo_noregistrado") { //enviar mensaje solo a los que nunca contactaste

      if (contactado === false) {
        //enviar mensaje,nunca lo contactaste
        console.log("Mensaje Enviado - Nunca Contactado");
        //enviar mensaje
        if (file) {

          client.sendMessage(number_formated, message).then(response => {
            results.push(JSON.stringify(response));
          }).catch(err => {
            results.push(JSON.stringify(err));
          });
          media.forEach(index => {
            client.sendMessage(number_formated, index, {
              caption: caption
            }).then(response => {
              results.push(response);
            }).catch(err => {
              results.push(err);
            });
          });

        } else {

          client.sendMessage(number_formated, message).then(response => {
            results.push(response);
          }).catch(err => {
            results.push(err);
          });

        }
        //end enviar mensaje
      }

    } else if (type === "modo_enviado") { //enviar mensaje solo a los que contactaste pero no te respondieron

      if (contactado === false) {
        return
      } else if (contactado.pushname === undefined) {
        console.log("Mensaje Enviado - Contactado pero no Te Respondio");
        //enviar mensaje
        if (file) {

          client.sendMessage(number_formated, message).then(response => {
            results.push(JSON.stringify(response));
          }).catch(err => {
            results.push(JSON.stringify(err));
          });
          media.forEach(index => {
            client.sendMessage(number_formated, index, {
              caption: caption
            }).then(response => {
              results.push(response);
            }).catch(err => {
              results.push(err);
            });
          });

        } else {

          client.sendMessage(number_formated, message).then(response => {
            results.push(response);
          }).catch(err => {
            results.push(err);
          });

        }
        //end enviar mensaje
      }

    } else if (type === "modo_respondieron") { //enviar mensaje solo a los que contactaste y te respondieron

      if (contactado === false) {
        return
      } else if (contactado.isMyContact === true) { //es un contacto tuyo no enviar
        return
      } else if (contactado.pushname != undefined) { //contactado y te respondio
        console.log("Mensaje Enviado - Contactado y Te Respondio"+ JSON.stringify(contactado.pushname));
        //enviar mensaje
        if (file) {

          client.sendMessage(number_formated, message).then(response => {
            results.push(JSON.stringify(response));
          }).catch(err => {
            results.push(JSON.stringify(err));
          });
          media.forEach(index => {
            client.sendMessage(number_formated, index, {
              caption: caption
            }).then(response => {
              results.push(response);
            }).catch(err => {
              results.push(err);
            });
          });

        } else {

          client.sendMessage(number_formated, message).then(response => {
            results.push(response);
          }).catch(err => {
            results.push(err);
          });

        }
        //end enviar mensaje
      }

    } else if (type === "modo_contact") { //enviar mensaje solo a tus contactos

      if (contactado === false) {
        return
      } else if (typeof contactado.push !== undefined) { //tengo su nombre buscar si es un contacto
        if (contactado.isMyContact === true) {
          console.log("Enviar Mensaje - Es mi Contacto");
          //enviar mensaje
          if (file) {
            client.sendMessage(number_formated, message).then(response => {
              results.push(JSON.stringify(response));
            }).catch(err => {
              results.push(JSON.stringify(err));
            });
            media.forEach(index => {
              client.sendMessage(number_formated, index, {
                caption: caption
              }).then(response => {
                results.push(response);
              }).catch(err => {
                results.push(err);
              });
            });

          } else {

            client.sendMessage(number_formated, message).then(response => {
              results.push(response);
            }).catch(err => {
              results.push(err);
            });

          }
          //end enviar mensaje
        }
      }

    }


  });

  res.status(200).json({
    status: true,
    response: results
  });


});

// Send message multiple verify
app.post('/send-message-multiple-verify', [
  body('numbers').notEmpty(),
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

  const numbers = JSON.parse(req.body.numbers);
  const message = JSON.parse(req.body.message);
  //send file
  const caption = req.body.caption;
  let file;
  let media = [];

  if (req.files) {
    file = (Array.isArray(req.files.file) ? req.files.file : [req.files.file]).filter(e => e);
  }

  console.log(file);

  if (file) {
    file.forEach(index => {
      media.push(new MessageMedia(index.mimetype, index.data.toString('base64'), index.name));
    });
  }

  let results = [];
  let is_verify;
  let is_wa;
  let formated;

  numbers.forEach(async (number) => {

    formated = phoneNumberFormatter(number);
    is_wa = await checkRegisteredNumber(formated);
    if (is_wa) {
      try {
        is_verify = await client.getContactById(formated);
      } catch (error) {
        is_verify = "not_contact";
      }

      if (is_verify !== "not_contact") {

        if (file) {

          client.sendMessage(formated, message).then(response => {
            results.push(JSON.stringify(response));
          }).catch(err => {
            results.push(JSON.stringify(err));
          });

          media.forEach(index => {

            //send caption 
            client.sendMessage(formated, index, {
              caption: caption
            }).then(response => {
              results.push(response);
            }).catch(err => {
              results.push(err);
            });

          });

        } else {

          client.sendMessage(formated, message).then(response => {
            results.push(response);
          }).catch(err => {
            results.push(err);
          });

        }

      }
    } else {
      console.log("Numero no registrado en WSP");
    }


  });

  res.status(200).json({
    status: true,
    response: results
  });

});

//get contacts
app.get('/get-contacts', async (req, res) => {

  const contacts = await client.getContacts();

  if (contacts) {
    res.json(contacts);
  } else {
    res.send("Not Found");
  }

});

//get chats
app.get('/get-chats', async (req, res) => {

  const chats = await client.getChats();

  if (chats) {
    res.json(chats);
  } else {
    res.send("Not Found");
  }

});

//get chat by id
app.get('/get-chat/:id', async (req, res) => {
  const {
    id
  } = req.params;
  let chat = await client.getChatById(id);
  
  chat = await chat.fetchMessages(20);

  if (chat) {
    res.json(chat);
  } else {
    res.send("Not Found");
  }
});

//get contact by id
app.get('/get-contact/:id', async (req, res) => {
  const {
    id
  } = req.params;
  let contact;
  try {
    contact = await client.getContactById(id);
   
    
  } catch (error) {
    contact = "No hay datos";
  }

  if (contact) {
    res.json(contact);
  } else {
    res.send("Not Found");
  }
});

//get group by id
app.get('/get-group/:id', async (req, res) => {
  const {
    id
  } = req.params;
  let chat;
  let data = [];
  try {

    chat= await client.getChatById(id);

    for(let participant of chat.participants){
      let contact = await client.getContactById(participant.id._serialized);
      data.push(contact);
    }

  } catch (error) {
    chat = "No hay datos";
  }

  if (chat) {
    res.json(data);
  } else {
    res.send("Not Found");
  }
});

//check connection
connection.connect(error => {
  if (error) throw error;
  console.log('Database server running');
});


server.listen(port, function () {
  console.log('App running on *: ' + port);
});