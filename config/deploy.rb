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

namespace :deploy do
  task :symlink, :roles => :app do
    run "ln -nfs #{shared_path}/files #{release_path}/files"
  end
end

after "deploy:create_symlink", "deploy:npm_install", "deploy:symlink", "deploy:restart"
