import "./globals.css";

export const metadata = {
    title: "Micro.pollinations.ai",
    description: "A microservice for mailer utilities and other microservices",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
