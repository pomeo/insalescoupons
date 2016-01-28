const mongoose    = require('mongoose');
const Schema      = mongoose.Schema;

const TasksSchema = new Schema();

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
  updated_at   : Date,    // дата изменения
});

mongoose.model('Tasks', TasksSchema);
