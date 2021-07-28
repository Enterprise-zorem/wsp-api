const {Client} = require('mysql');

const connection=mysql.createConnection({
    host:'us-cdbr-east-04.cleardb.com',
    user: 'bea5bc766a235d',
    password:'48d8419d',
    database:'heroku_011a19c254b3fbf'
  });

setInterval(function () {
    connection.query('SELECT 1');
  }, 5000);
  
const readSession = async () => {
    try {
        const 
        const res = await connection.query()
    } catch (error) {
        
    }
}