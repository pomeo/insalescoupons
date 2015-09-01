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
set :deploy_to,   "/home/ubuntu/projects/coupons"
set :supervisord_start_group, "coupons"
set :supervisord_stop_group, "coupons"
set :shared_children, shared_children + %w{files}
#========================
#ROLES
#========================
role :app,        "ubuntu@#{application}"

namespace :deploy do
  desc "Symlink shared configs and folders on each release."
  task :symlink_shared do
    run "ln -s #{shared_path}/files #{release_path}/files"
  end
end

namespace :deploy do
  desc "Change node.js port"
  task :chg_port do
    run "sed -i 's/3000/3200/g' #{current_path}/app.js"
  end
end

after "deploy:create_symlink", "deploy:npm_install", "deploy:symlink_shared", "deploy:chg_port", "deploy:restart"
