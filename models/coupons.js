const mongoose    = require('mongoose');
const Schema      = mongoose.Schema;

const CouponsSchema = new Schema();

CouponsSchema.add({
  insalesid           : { type: Number, index: true }, // id магазина
  guid                : { type: Number, index: true }, // id купона
  code                : { type: String, index: true }, // код купона
  description         : String, // описание купона
  act                 : Boolean, // одноразовый или многоразовый купон
  actclient           : Boolean, // одноразовый для зарегистрированного покупателя
  typeid              : Number, // тип скидки
  discount            : String, // размер скидки
  minprice            : Number, // минимальная цена при которой купон не раборает
  worked              : Boolean, // использованный купон или нет
  discountcollections : String, // строка названий разделов
  collections_id      : String, // строка id разделов разделённых запятой
  expired_at          : Date, // дата истечения купона, от insales
  created_at          : Date, // дата создания купона, от insales
  updated_at          : Date, // дата обновления купона, от insales
  disabled            : Boolean, // активный/неактивный купон
});

mongoose.model('Coupons', CouponsSchema);
