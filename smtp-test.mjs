import net from "node:net";
import { deliverEmail } from "./src/mailer.js";
import { resetDatabase } from "./src/db.js";

let received = "";
const server = net.createServer((socket) => {
  let buffer = "";
  let inData = false;
  let data = "";
  let expectUser = false;
  let expectPass = false;
  socket.write("220 localhost ESMTP test\r\n");
  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    if (inData) {
      data += buffer;
      buffer = "";
      if (data.includes("\r\n.\r\n")) {
        received = data;
        data = "";
        inData = false;
        socket.write("250 2.0.0 queued\r\n");
      }
      return;
    }
    let index;
    while ((index = buffer.indexOf("\r\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      if (/^EHLO/i.test(line)) socket.write("250-localhost\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 10485760\r\n");
      else if (/^AUTH LOGIN/i.test(line)) {
        expectUser = true;
        socket.write("334 VXNlcm5hbWU6\r\n");
      }
      else if (expectUser) {
        expectUser = false;
        expectPass = true;
        socket.write("334 UGFzc3dvcmQ6\r\n");
      }
      else if (expectPass) {
        expectPass = false;
        socket.write("235 2.7.0 Authentication successful\r\n");
      }
      else if (/^MAIL FROM/i.test(line)) socket.write("250 OK\r\n");
      else if (/^RCPT TO/i.test(line)) socket.write("250 OK\r\n");
      else if (/^DATA/i.test(line)) {
        inData = true;
        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
      } else if (/^QUIT/i.test(line)) {
        socket.write("221 Bye\r\n");
        socket.end();
      } else {
        socket.write("235 2.7.0 Authentication successful\r\n");
      }
    }
  });
});

await new Promise((resolve) => server.listen(2525, "127.0.0.1", resolve));
process.env.SMTP_HOST = "127.0.0.1";
process.env.SMTP_PORT = "2525";
process.env.SMTP_USER = "test";
process.env.SMTP_PASS = "secret";
process.env.MAIL_FROM = "Vulture Desk <desk@example.com>";

const settings = { testMode: false, testEmail: "srenuka39903@gmail.com" };
const record = await deliverEmail({
  student: { id: "s1", name: "Madhu", email: "madhu@example.com" },
  type: "invite",
  subject: "Hello Madhu",
  html: "<html><body><h1>Hello</h1><p>Test email body.</p></body></html>",
  text: "Hello. Test email body.",
  settings,
});
console.log("STATUS", record.status, record.error);
console.log("MESSAGE HEAD", received.split("\r\n").slice(0, 14).join("\n"));
console.log("HAS SUBJECT", received.includes("Subject:"));
console.log("HAS HTML", received.includes(Buffer.from("<h1>Hello</h1>").toString("base64").slice(0, 10)));
server.close();
await resetDatabase();
