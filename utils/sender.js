const { MailtrapClient } = require("mailtrap");
const handlebars = require("handlebars");
const fs = require("fs");
const path = require("path");

const sendEmail = async (email, subject, payload, template) => {
  const TOKEN = process.env.EMAIL_PASSWORD;
  const ENDPOINT = "https://send.api.mailtrap.io/";

  const client = new MailtrapClient({ endpoint: ENDPOINT, token: TOKEN });

  const sender = {
    email: "service@exioslibya.com",
    name: "Exios Company",
  };
  const recipients = [
    {
      email,
    }
  ];

  const source = fs.readFileSync(path.join(__dirname, template), "utf8");
  const compiledTemplate = handlebars.compile(source);

  client
    .send({
      from: sender,
      to: recipients,
      subject,
      html: compiledTemplate(payload),
    })
    .then(console.log, console.error)
}

// ****************** nodemailer code ************************ 

// const sendEmail = async (email, subject, payload, template) => {
//   try {
//     // create reusable transporter object using the default SMTP transport
//     const transporter = await nodemailer.createTransport({
//       host: process.env.EMAIL_HOST,
//       port: 587,
//       auth: {
//         user: process.env.EMAIL_USERNAME,
//         pass: process.env.EMAIL_PASSWORD, // naturally, replace both with your real credentials or an application-specific password
//       },
//     });

//     const source = fs.readFileSync(path.join(__dirname, template), "utf8");
//     const compiledTemplate = handlebars.compile(source);
//     const options = () => {
//       return {
//         from: process.env.FROM_EMAIL,
//         to: email,
//         subject: subject,
//         html: compiledTemplate(payload),
//       };
//     };

//     // Send email
//     transporter.sendMail(options(), (error, info) => {
//       if (error) {
//         console.log(error);
//         return error;
//       } else {
//         console.log(info);

//         return true
//       }
//     });
//   } catch (error) {
//     console.log("outside ", error);
//     return error;
//   }
// };

/*
Example:
sendEmail(
  "youremail@gmail.com,
  "Email subject",
  { name: "Eze" },
  "./templates/layouts/main.handlebars"
);
*/

module.exports = { sendEmail };
