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
set :supervisord_start_group, "coupons"
set :supervisord_stop_group, "coupons"
#========================
#ROLES
#========================
set  :gateway,    "#{application}"    # main server
role :app,        "ubuntu@10.3.10.40" # lxc container

after "deploy:create_symlink", "deploy:npm_install", "deploy:restart"
