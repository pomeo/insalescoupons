const mongoose    = require('mongoose');
const Schema      = mongoose.Schema;

const SettingsSchema = new Schema();

SettingsSchema.add({
  insalesid   : { type: Number, index: true }, // id магазина
  property    : { type: String, index: true }, // свойство
  value       : String, // значение свойства
  created_at  : Date, // дата создания
  updated_at  : Date, // дата изменения
});

mongoose.model('Settings', SettingsSchema);
