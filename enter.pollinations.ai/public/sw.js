self.addEventListener("push", (event) => {
	const data = event.data?.json() ?? { title: "Pollinations", body: "" };
	event.waitUntil(
		self.registration.showNotification(data.title, {
			body: data.body,
			icon: "/icon-192.png",
			badge: "/favicon-32x32.png",
			data: data.url ? { url: data.url } : undefined,
		}),
	);
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	if (event.notification.data?.url) {
		event.waitUntil(clients.openWindow(event.notification.data.url));
	}
});
