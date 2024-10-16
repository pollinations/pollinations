import app from './server.js';

const port = process.env.PORT || 16385;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
