class SpaController < ApplicationController
  layout :spa_layout

  def show
    @spa_embedded = request.path == transactions_path
    @spa_entrypoint = @spa_embedded
    @breadcrumbs = [ [ t("breadcrumbs.home"), root_path ], [ t("breadcrumbs.transactions"), nil ] ] if @spa_embedded
  end

  private
    def spa_layout
      @spa_embedded ? "application" : "spa"
    end
end
