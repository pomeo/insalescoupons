#========================
#CONFIG
#========================
set :application, "coupons.salesapps.ru"
#========================
#CONFIG
#========================
require           "capistrano-offroad"
offroad_modules   "defaults", "supervisord"
set :repository,  "git@github.com:pomeo/insalescoupons.git"
set :supervisord_start_group, "app"
set :supervisord_stop_group, "app"
#========================
#ROLES
#========================
role :app,        "ubuntu@#{application}"

after "deploy:create_symlink", "deploy:npm_install", "deploy:restart"
