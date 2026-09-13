# 🛡️ DDoS Shield

**Web Application Rate Limiter & DDoS Shield Middleware**

A lightweight, pluggable Express.js middleware that monitors incoming website traffic in real time, identifies normal users versus suspicious/automated traffic, detects request bursts and abuse, automatically rate-limits or blocks suspicious clients, challenges them with a CAPTCHA, and provides an admin dashboard where the website owner can monitor and control traffic.

🌐 **Live Demo:** [https://ddos-shield-i2id.onrender.com](https://ddos-shield-i2id.onrender.com)

📊 **Admin Dashboard:** [https://ddos-shield-i2id.onrender.com/__shield/](https://ddos-shield-i2id.onrender.com/__shield/)

---

## 📖 Project Overview

DDoS Shield is a defensive security middleware that any Express.js application can plug in with a single line of code:


app.use(shield);
