const mongoose    = require('mongoose');
const Schema      = mongoose.Schema;

const GroupsSchema = new Schema();

GroupsSchema.add({
  insalesid   : { type: Number, index: true }, // id магазина
  groupid     : { type: String, unique: true }, // id группы
  groupname   : { type: String, index: true }, // название группы
  created_at  : Date, // дата создания группы
});

mongoose.model('Groups', GroupsSchema);
