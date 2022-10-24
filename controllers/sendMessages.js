const wbm = require('wbm');
const { validatePhoneNumber } = require('../utils/messages');
const ErrorHandler = require('../utils/errorHandler');

module.exports.sendWhatsupMessage = async (req, res, next) => {
  const { phone, message } = req.body;
  // check for Qr Code
  // wbm.start()
  //   .then(async (qrCodeData) => {
  //     const receiver = validatePhoneNumber(phone);
  //     const phones = [receiver];
  //     await wbm.send(phones, message);
  //     await wbm.end();
  //     res.status(200).send(qrCodeData)
  //   })
  //   .catch(error => res.send(error))

    // generete
    wbm
    .start({ qrCodeData: true, session: false, showBrowser: false })
    .then(async (qrCodeData) => {
      console.log(qrCodeData); // show data used to generate QR Code
      res.send(qrCodeData);
      await wbm.waitQRCode();

      const phones = [phone];

      await wbm.send(phones, message);
      await wbm.end();
    })
    .catch((err) => {
      console.log(err);
    });
}
