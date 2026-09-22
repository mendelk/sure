# Automatically enable YJIT as of Ruby 3.3, as it brings very
# sizeable performance improvements.

# If you are deploying to a memory constrained environment
# you may want to delete this file, but otherwise it's free
# performance.
if ENV["SURE_SKIP_YJIT"].present?
  Rails.logger.info("Skipping YJIT (SURE_SKIP_YJIT is set)")
elsif defined? RubyVM::YJIT.enable
  Rails.application.config.after_initialize do
    RubyVM::YJIT.enable
  end
end
