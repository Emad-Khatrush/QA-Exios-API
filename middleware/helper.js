const { orderLabels } = require("../constants/orderLabels");

exports.generateString = (length, characters) => {
    let result = '';
    const charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }

    return result;
}

exports.addChangedField = (fieldName, newData, oldData, labels) => {
    switch (fieldName) {
        case 'debt':
            return {
                label: labels[fieldName],
                value: fieldName,
                changedFrom: `${oldData?.total || '0'} ${oldData?.currency || 'empty'}`,
                changedTo: `${newData?.total || '0'} ${newData?.currency || 'empty'}`
              }
        case 'cost':
        return {
            label: labels[fieldName],
            value: fieldName,
            changedFrom: `${oldData?.total || '0'} ${oldData?.currency || 'empty'}`,
            changedTo: `${newData?.total || '0'} ${newData?.currency || 'empty'}`
            }
        case 'paymentList':
            return {
                label: labels[fieldName],
                value: fieldName,
                changedFrom: String(oldData?.length) || 'empty',
                changedTo: String(newData?.length) || 'empty',
            }
    
        default:
            return {
                label: labels[fieldName],
                value: fieldName,
                changedFrom: oldData || 'empty',
                changedTo: newData,
            }
    }
}

exports.getTapTypeQuery = (tapType) => {
    switch (tapType) {
        case 'active':
            return { isFinished: false,  unsureOrder: false }
        
        case 'shipment':
            return { isShipment: true,  unsureOrder: false, isPayment: false,  isFinished: false }
        
        case 'arriving':
            return { isPayment: true,  orderStatus: 1 }

        case 'unpaid':
            return { unsureOrder: false,  orderStatus: 0, isPayment: true }

        case 'finished':
            return { isFinished: true }

        case 'unsure':
            return { unsureOrder: true }
    
        default:
            return { isFinished: false,  unsureOrder: false }
    }
}