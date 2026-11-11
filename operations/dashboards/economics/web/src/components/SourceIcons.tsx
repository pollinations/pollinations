// Official service favicons, stored locally so opening the menu makes no external request.
// Sources: https://www.tinybird.co/favicon.ico and https://drive.google.com/favicon.ico
import googleDriveIcon from "../assets/google-drive.ico";
import tinybirdIcon from "../assets/tinybird.ico";

export function GoogleDriveIcon({ className }: { className?: string }) {
    return (
        <img
            src={googleDriveIcon}
            alt="Google Drive"
            title="Stored in Google Drive"
            className={className}
        />
    );
}

export function TinybirdIcon({ className }: { className?: string }) {
    return (
        <img
            src={tinybirdIcon}
            alt="Tinybird"
            title="Stored in Tinybird"
            className={className}
        />
    );
}
