import debug from 'debug'
// import app from './server'
import app from './server_litellm'

const log = debug('pollinations:startup')

const port = process.env.PORT ?? 16385

app.listen(port, () => {
    log('Server is running on port %d', port)
})