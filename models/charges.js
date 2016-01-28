const mongoose    = require('mongoose');
const Schema      = mongoose.Schema;

const ChargesSchema = new Schema();

ChargesSchema.add({
  insalesid        : { type: Number, index: true }, // id магазина
  guid             : { type: Number, index: true }, // id списания
  monthly          : String, // сумма
  till             : String, // заплачено до
  blocked          : Boolean, // заблочен за неуплату
  expired_at       : String, // окончание триала
  updated_at       : Date, // дата из ответа insales
  created_at       : Date, // дата из ответа insales
});

mongoose.model('Charges', ChargesSchema);
