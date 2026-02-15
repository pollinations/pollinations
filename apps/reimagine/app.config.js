import 'dotenv/config';
import appJson from './app.json';

export default ({ config }) => ({
    ...appJson.expo,
    extra: {
        BANNED_IMAGES_URL: process.env.BANNED_IMAGES_URL,
        VERSION_URL: process.env.VERSION_URL,
        FORMCARRY_ENDPOINT: process.env.FORMCARRY_ENDPOINT,
        ADMIN_EMAIL: process.env.ADMIN_EMAIL,
        FROM_EMAIL: process.env.FROM_EMAIL,
        IMGBB_API_KEY: process.env.IMGBB_API_KEY,
        APP_REFERER: process.env.APP_REFERER,
        COOLDOWN_SECONDS: process.env.COOLDOWN_SECONDS,
        MAX_GENERATIONS_PER_DAY: process.env.MAX_GENERATIONS_PER_DAY,
    }
});
