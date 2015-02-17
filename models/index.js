var mongoose    = require('mongoose'),
    Schema      = mongoose.Schema;

var ChargesSchema = new Schema();

ChargesSchema.add({
  insalesid        : { type: Number, index: true }, // id магазина
  guid             : { type: Number, index: true }, // id списания
  monthly          : String, // сумма
  till             : String, // заплачено до
  blocked          : Boolean, // заблочен за неуплату
  expired_at       : String, // окончание триала
  updated_at       : Date, // дата из ответа insales
  created_at       : Date // дата из ответа insales
});

var GroupsSchema = new Schema();

GroupsSchema.add({
  insalesid   : { type: Number, index: true }, // id магазина
  groupid     : { type: String, unique: true }, // id группы
  groupname   : { type: String, index: true }, // название группы
  created_at  : Date // дата создания группы
});

var CollectionsSchema = new Schema();

CollectionsSchema.add({
  insalesid   : { type: Number, index: true }, // id магазина
  colid       : { type: Number, index: true }, // id категории
  name        : String, // название категории
  parentid    : { type: Number, index: true }, // id родительской категории
  created_at  : Date, // дата создания категории
  updated_at  : Date // дата изменения категории
});

var TasksSchema = new Schema();

TasksSchema.add({
  insalesid    : { type: Number, index: true }, // id магазина
  type         : { type: Number, index: true }, // тип задания
  path         : String, // путь до файла во время импорта
  status       : Number, // статус задания
  message      : String, // сообщение об ошибке
  file         : Number, // тригер о готовности файла
  numbers      : Number, // количество купонов
  parts        : Number, // количество частей купона
  length       : Number, // длина части купона
  act          : Number, // одно или много-разовый купон
  actclient    : Number, // использовать один раз для зарегистрированного
  minprice     : Number, // минимальная сумма заказа
  variant      : Number, // варианты развития задания
  typediscount : Number, // процент или денежная единица
  discount     : String, // величина скидки
  until        : String, // срок действия купона
  group        : String, // название группы купона
  count        : Number, // количество повторных запусков задания
  created_at   : Date,   // дата создания
  updated_at   : Date    // дата изменения
});

var SettingsSchema = new Schema();

SettingsSchema.add({
  insalesid   : { type: Number, index: true }, // id магазина
  property    : { type: String, index: true }, // свойство
  value       : String, // значение свойства
  created_at  : Date, // дата создания
  updated_at  : Date // дата изменения
});

var CouponsSchema = new Schema();

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
  disabled            : Boolean // активный/неактивный купон
});

var AppsSchema = new Schema();

AppsSchema.add({
  insalesid   : { type: Number, unique: true }, // id магазина
  insalesurl  : String, // урл магазина
  token       : String, // ключ доступа к api
  autologin   : String, // сохраняется ключ автологина
  created_at  : Date, // дата создания записи
  updated_at  : Date, // дата изменения записи
  enabled     : Boolean // установлено или нет приложение для магазина
});

module.exports = {
  Apps: mongoose.model('Apps', AppsSchema),
  Task: mongoose.model('Tasks', TasksSchema),
  Sett: mongoose.model('Settings', SettingsSchema),
  Coll: mongoose.model('Collections', CollectionsSchema),
  Coup: mongoose.model('Coupons', CouponsSchema),
  Chrg: mongoose.model('Charges', ChargesSchema),
  Grup: mongoose.model('Groups', GroupsSchema)
}