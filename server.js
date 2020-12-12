require('dotenv').config();
const bodyParser = require('body-parser');
const express = require('express')
    aws = require('aws-sdk')
    multer = require('multer')
    multerS3 = require('multer-s3')
    cors = require('cors')
    mysql = require('mysql2/promise')


const app = express()

const pool = mysql.createPool({
    host: process.env.MYSQL_SERVER,
    port: process.env.MYSQL_PORT,
    user: process.env.MYSQL_USERNAME,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    connectionLimit: process.env.MYSQL_CONNECTION
})

const startApp = async(app, pool) => {
    const conn = await pool.getConnection()
    try {
        console.log('Pinging database...')
        await conn.ping()
        app.listen(APP_PORT, () => {
            console.log(`Application start on port ${APP_PORT} at ${new Date()}`)
        })
    } catch(e) {
        console.error('Cannot ping databse', e)
    } finally {
        conn.release()
    }
} 



app.use(cors())
app.use(bodyParser.urlencoded({limit: '50mb', extended: true}))
app.use(bodyParser.json({limit: '50mb'}))

const APP_PORT = process.env.APP_PORT
const AWS_S3_HOSTNAME = process.env.AWS_S3_HOSTNAME;
const AWS_S3_ACCESSKEY_ID = process.env.AWS_S3_ACCESSKEY_ID
const AWS_S3_SECRET_ACCESSKEY= process.env.AWS_S3_SECRET_ACCESSKEY;
const AWS_S3_BUCKET_NAME=process.env.AWS_S3_BUCKET_NAME;

const spacesEndpoint = new aws.Endpoint(AWS_S3_HOSTNAME)
const s3 = new aws.S3({
    endpoint: spacesEndpoint,
    accessKeyId: AWS_S3_ACCESSKEY_ID,
    secretAccessKey: AWS_S3_SECRET_ACCESSKEY
})

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: AWS_S3_BUCKET_NAME,
        acl: 'public-read',
        key: (request, file, callback) => {
            console.log('file:', file) 
            callback(null, new Date().getTime() + '_' + file.originalname)
        }
    })
}).single('upload')

app.post('/upload', (req, res) => {
    console.log('went to /upload')
    upload(req, res, (error) => {
        if (error) {
            console.log(error)
            return res.redirect('/error')
        }
        console.log('Image upload success')
        res.status(200).json({
            message: 'Image uploaded to DigitalOcean',
            s3_file_key: res.req.file.location
        })
        // console.log('Response from Ng: ', res.req.file)
    })
})

const insertTodos = async(todoName, todoDueDate, todoPriority, todoImageUrl, subtodoDescriptionArray) => {
    const conn = await pool.getConnection()
    try {
        console.log('inserting todos....')
        await conn.beginTransaction()
        let todoResult = await conn.query(
            `INSERT INTO todos 
                (name, dueDate, priority, imageUrl) 
            values 
                (?, ?, ?, ?)`,
                [todoName, todoDueDate, todoPriority, todoImageUrl]    
        )
        console.log('id returned: ', todoResult[0].insertId)
        for (const subtodoDescription of subtodoDescriptionArray) {
            await conn.query(
                `INSERT INTO subtodos
                    (todos_id, description)
                values 
                    (?, ?)`,
                    [todoResult[0].insertId, subtodoDescription]
            )
        }
            
        await conn.commit()
        console.log('committed and sent to MySQL')
    } catch(e) {
        conn.rollback()
    } finally {
        conn.release()
    }
}

app.post('/database', (req, res) => {
    // upload to MySQL
    console.log('you have posted data to Express')
    let todoName = req.body[0]['name']
    let todoDueDate = req.body[0]['dueDate']
    let todoPriority = req.body[0]['priority']
    let todoImageUrl = req.body[2]
    let subtodoDescriptionArray = req.body[1]['subTodoArray'][0]
    // console.log('variables: ', todoName, todoDueDate, todoPriority, todoImageUrl, subtodoDescription)
    insertTodos(todoName, todoDueDate, todoPriority, todoImageUrl, subtodoDescriptionArray)
})

const getTodos = async() => {
    const conn = await pool.getConnection()
    try {
        console.log('getting todos....')
        // await conn.beginTransaction()
        let getTodoResults = await conn.query(`SELECT * FROM todos`)
        let getSubtodoResults = await conn.query(`SELECT * FROM subtodos`)
        // await conn.commit()
        console.log('returned from SQL: ', getTodoResults)
    } catch(e) {
        console.log(e)
        // conn.rollback()
    } finally {
        conn.release()
    }
}

app.get('/getdatabase', (req, res) => {
    getTodos()
})

startApp (app, pool);