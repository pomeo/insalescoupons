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
set :shared_children, shared_children + %w{public/files}
#========================
#ROLES
#========================
set  :gateway,    "#{application}" # main server
role :app,        "10.3.20.1"      # container

after "deploy:create_symlink",
      "deploy:npm_install",
      "deploy:cleanup",
      "deploy:restart"
