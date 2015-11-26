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
set :shared_children, shared_children + %w{files}
#========================
#ROLES
#========================
set  :gateway,    "#{application}" # main server
role :app,        "10.3.20.1"      # container

namespace :deploy do
  desc "Symlink shared configs and folders on each release."
  task :symlink_shared do
    run "ln -s #{shared_path}/files #{release_path}/files"
  end
end

after "deploy:create_symlink",
      "deploy:npm_install",
      "deploy:symlink_shared",
      "deploy:cleanup",
      "deploy:restart"
