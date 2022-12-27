const wbm = require('../utils/wbm');
const { validatePhoneNumber } = require('../utils/messages');
const ErrorHandler = require('../utils/errorHandler');

module.exports.sendWhatsupMessage = async (req, res, next) => {
  const { phone, message, shouldVerifyQrCode } = req.body;

    // generete
    wbm
    .start({ sendMessage: !shouldVerifyQrCode })
    .then(async (qrCodeData) => {
      if (shouldVerifyQrCode) {
        res.status(200).send(qrCodeData);
        wbm.waitQRCode();
      } else {
        const receiver = validatePhoneNumber(phone);
        const phones = [receiver];
        try {
          await wbm.send(['905535728209'], message);
          await wbm.end();
        } catch (error) {
          return next(new ErrorHandler(404, error.message));
        }
        res.status(200).send(qrCodeData)
      }
    })
    .catch((err) => {
      console.log("errrrrror", err);
    });

    // generete
    // wbm
    // .start({ qrCodeData: true, session: false, showBrowser: false })
    // .then(async (qrCodeData) => {
    //     res.send(qrCodeData);
    //     await wbm.waitQRCode();

    //     const receiver = validatePhoneNumber(phone);
    //     const phones = [phone];
    //     await wbm.send(['905535728209'], message);
    //     await wbm.end();
    //     res.status(200).send(qrCodeData)
    // })
    // .catch((err) => {
    //   console.log("errrrrror", err);
    //   return next(new ErrorHandler(404, err.message));
    // });
}
