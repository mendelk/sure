# frozen_string_literal: true

require 'rails_helper'

RSpec.configure do |config|
  config.openapi_root = Rails.root.join('docs', 'api').to_s
  reset_count_keys = Family::FinancialDataReset::STATUS_COUNT_KEYS.map(&:to_s)

  config.openapi_specs = {
    'openapi.yaml' => {
      openapi: '3.0.3',
      info: {
        title: 'Sure API',
        version: 'v1',
        description: 'OpenAPI documentation generated from executable request specs.'
      },
      servers: [
        {
          url: 'https://app.sure.am',
          description: 'Production'
        },
        {
          url: 'http://localhost:3000',
          description: 'Local development'
        }
      ],
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: :apiKey,
            name: 'X-Api-Key',
            in: :header,
            description: 'API key for authentication. Generate one from your account settings.'
          },
          financekitPublisher: {
            type: :http,
            scheme: :bearer,
            bearerFormat: 'opaque publisher credential',
            description: 'Revocable credential restricted to one FinanceKit publisher upload URL.'
          },
          oauth2: {
            type: :oauth2,
            flows: {
              authorizationCode: {
                authorizationUrl: '/oauth/authorize',
                tokenUrl: '/oauth/token',
                scopes: {
                  read: 'Read access',
                  read_write: 'Read and write access'
                }
              }
            }
          },
          cookieSession: {
            type: :apiKey,
            name: 'session_token',
            in: :cookie,
            description: 'Authenticated Sure browser session.'
          },
          csrfToken: {
            type: :apiKey,
            name: 'X-CSRF-Token',
            in: :header,
            description: 'Required for unsafe requests authenticated with a browser session; API-key and OAuth authentication do not require CSRF tokens.'
          }
        },
        schemas: {
          AccountProviderLink: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid",
                nullable: true
              },
              provider_type: {
                type: "string"
              },
              provider_id: {
                type: "string",
                format: "uuid"
              },
              provider_key: {
                type: "string",
                nullable: true
              },
              item_id: {
                type: "string",
                nullable: true
              }
            },
            required: [ "id", "provider_type", "provider_id", "provider_key", "item_id" ]
          },
          AccountWorkspaceAction: {
            type: "object",
            properties: {
              key: {
                type: "string"
              },
              label: {
                type: "string"
              },
              href: {
                type: "string"
              },
              method: {
                type: "string",
                enum: [ "get", "post", "patch", "delete" ]
              },
              icon: {
                type: "string"
              },
              params: {
                type: "object",
                additionalProperties: true
              },
              confirm: {
                nullable: true,
                oneOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "object",
                    properties: {
                      title: {
                        type: "string"
                      },
                      body: {
                        type: "string"
                      },
                      confirmText: {
                        type: "string"
                      },
                      variant: {
                        type: "string"
                      }
                    }
                  }
                ]
              }
            },
            required: [ "key", "label", "href" ]
          },
          AccountWorkspaceCard: {
            type: "object",
            properties: {
              label: {
                type: "string"
              },
              value: {
                type: "string"
              },
              description: {
                type: "string",
                nullable: true
              },
              tone: {
                type: "string"
              }
            },
            required: [ "label", "value", "description", "tone" ]
          },
          AccountWorkspaceRow: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid"
              },
              name: {
                type: "string"
              },
              accountable_type: {
                type: "string"
              },
              subtype_label: {
                type: "string"
              },
              currency: {
                type: "string"
              },
              balance: {
                type: "string"
              },
              status: {
                type: "string"
              },
              linked: {
                type: "boolean"
              },
              provider_links: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/AccountProviderLink"
                }
              },
              syncing: {
                type: "boolean"
              },
              draft: {
                type: "boolean"
              },
              pending_deletion: {
                type: "boolean"
              },
              active: {
                type: "boolean"
              },
              exclude_from_reports: {
                type: "boolean"
              },
              shared: {
                type: "boolean"
              },
              owned: {
                type: "boolean"
              },
              owner_name: {
                type: "string",
                nullable: true
              },
              institution_name: {
                type: "string",
                nullable: true
              },
              logo_url: {
                type: "string",
                nullable: true
              },
              color: {
                type: "string"
              },
              is_default: {
                type: "boolean"
              },
              set_default_eligible: {
                type: "boolean"
              },
              manageable: {
                type: "boolean"
              },
              href: {
                type: "string"
              },
              edit_href: {
                type: "string"
              },
              sharing_href: {
                type: "string"
              },
              actions: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/AccountWorkspaceAction"
                }
              }
            },
            required: [ "id", "name", "status", "manageable", "actions" ]
          },
          AccountWorkspaceGroup: {
            type: "object",
            properties: {
              key: {
                type: "string"
              },
              name: {
                type: "string"
              },
              color: {
                type: "string"
              },
              total: {
                type: "string"
              },
              syncing: {
                type: "boolean"
              },
              accounts: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/AccountWorkspaceRow"
                }
              }
            },
            required: [ "key", "name", "total", "accounts" ]
          },
          AccountsWorkspace: {
            type: "object",
            properties: {
              sync: {
                type: "object",
                properties: {
                  syncing: {
                    type: "boolean"
                  },
                  sync_href: {
                    type: "string"
                  },
                  cancel_path: {
                    type: "string",
                    nullable: true
                  },
                  syncing_label: {
                    type: "string"
                  },
                  cancel_label: {
                    type: "string"
                  }
                },
                required: [ "syncing", "sync_href", "cancel_path", "syncing_label", "cancel_label" ]
              },
              new_account_path: {
                type: "string"
              },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    kind: {
                      type: "string"
                    },
                    provider_key: {
                      type: "string"
                    },
                    id: {
                      type: "string"
                    },
                    name: {
                      type: "string"
                    },
                    logo_url: {
                      type: "string",
                      nullable: true
                    },
                    logo_text: {
                      type: "string",
                      nullable: true
                    },
                    logo_icon: {
                      type: "string",
                      nullable: true
                    },
                    logo_color: {
                      type: "string",
                      nullable: true
                    },
                    status: {
                      type: "string"
                    },
                    status_label: {
                      type: "string",
                      nullable: true
                    },
                    syncing: {
                      type: "boolean"
                    },
                    scheduled_for_deletion: {
                      type: "boolean"
                    },
                    group: {
                      type: "array",
                      items: {
                        "$ref" => "#/components/schemas/AccountWorkspaceGroup"
                      },
                      nullable: true
                    },
                    empty: {
                      type: "object",
                      properties: {
                        title: {
                          type: "string"
                        },
                        description: {
                          type: "string"
                        }
                      },
                      nullable: true
                    },
                    wallet: {
                      type: "object",
                      properties: {
                        address_count: {
                          type: "integer"
                        },
                        accounts: {
                          type: "array",
                          items: {
                            "$ref" => "#/components/schemas/AccountWorkspaceRow"
                          }
                        },
                        sync_href: {
                          type: "string"
                        },
                        delete_href: {
                          type: "string"
                        }
                      },
                      nullable: true
                    },
                    manage_href: {
                      type: "string",
                      nullable: true
                    },
                    manage_label: {
                      type: "string",
                      nullable: true
                    },
                    setup_href: {
                      type: "string",
                      nullable: true
                    },
                    delete_href: {
                      type: "string",
                      nullable: true
                    },
                    confirm_delete: {
                      type: "object",
                      properties: {
                        title: {
                          type: "string"
                        },
                        body: {
                          type: "string"
                        },
                        confirmText: {
                          type: "string"
                        },
                        variant: {
                          type: "string"
                        }
                      }
                    },
                    replacement_prompts: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: {
                            type: "string"
                          },
                          description: {
                            type: "string"
                          },
                          relink_label: {
                            type: "string"
                          },
                          account_id: {
                            type: "string",
                            format: "uuid"
                          },
                          dismiss_label: {
                            type: "string"
                          },
                          relink_href: {
                            type: "string"
                          },
                          dismiss_href: {
                            type: "string",
                            nullable: true
                          },
                          dormant_sfa_id: {
                            type: "string"
                          },
                          active_sfa_id: {
                            type: "string"
                          }
                        }
                      }
                    }
                  },
                  required: [ "kind", "provider_key", "id", "name", "status", "syncing", "group" ]
                }
              },
              groups: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/AccountWorkspaceGroup"
                }
              }
            },
            required: [ "sync", "new_account_path", "items", "groups" ]
          },
          AccountWorkspace: {
            type: "object",
            properties: {
              id: {
                type: "string",
                format: "uuid"
              },
              name: {
                type: "string"
              },
              account_type: {
                type: "string"
              },
              currency: {
                type: "string"
              },
              subtitle: {
                type: "string",
                nullable: true
              },
              logo_url: {
                type: "string",
                nullable: true
              },
              color: {
                type: "string"
              },
              syncing: {
                type: "boolean"
              },
              shared: {
                type: "boolean"
              },
              owner_name: {
                type: "string",
                nullable: true
              },
              tax_treatment: {
                type: "string",
                nullable: true
              },
              draft: {
                type: "boolean"
              },
              disabled: {
                type: "boolean"
              },
              linked: {
                type: "boolean",
                nullable: true
              },
              balance: {
                type: "number",
                nullable: true
              },
              subtype: {
                type: "string",
                nullable: true
              },
              institution_name: {
                type: "string",
                nullable: true
              },
              institution_domain: {
                type: "string",
                nullable: true
              },
              notes: {
                type: "string",
                nullable: true
              },
              exclude_from_reports: {
                type: "boolean",
                nullable: true
              },
              actions: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/AccountWorkspaceAction"
                }
              },
              sync_action: {
                nullable: true,
                allOf: [
                  {
                    "$ref" => "#/components/schemas/AccountWorkspaceAction"
                  }
                ]
              },
              tabs: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      enum: [ "activity", "overview", "holdings", "schedule", "statements" ]
                    },
                    label: {
                      type: "string"
                    }
                  }
                }
              },
              active_tab: {
                type: "string"
              },
              chart: {
                type: "object",
                properties: {
                  title: {
                    type: "string"
                  },
                  value: {
                    type: "string"
                  },
                  converted_value: {
                    type: "string",
                    nullable: true
                  },
                  currency: {
                    type: "string"
                  },
                  view: {
                    type: "string"
                  },
                  views: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        key: {
                          type: "string"
                        },
                        label: {
                          type: "string"
                        }
                      }
                    }
                  },
                  period: {
                    type: "object",
                    properties: {
                      key: {
                        type: "string",
                        nullable: true
                      },
                      label: {
                        type: "string"
                      },
                      start_date: {
                        type: "string",
                        format: "date"
                      },
                      end_date: {
                        type: "string",
                        format: "date"
                      }
                    }
                  },
                  periods: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        key: {
                          type: "string"
                        },
                        label: {
                          type: "string"
                        }
                      }
                    }
                  },
                  trend: {
                    type: "object",
                    properties: {
                      value: {
                        type: "string"
                      },
                      percent: {
                        type: "string"
                      },
                      direction: {
                        type: "string",
                        enum: [ "up", "down", "flat" ]
                      },
                      favorable: {
                        type: "boolean"
                      },
                      comparison_label: {
                        type: "string"
                      }
                    }
                  },
                  series: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        key: {
                          type: "string"
                        },
                        label: {
                          type: "string"
                        },
                        tone: {
                          type: "string"
                        },
                        dashed: {
                          type: "boolean"
                        },
                        points: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              date: {
                                type: "string",
                                format: "date"
                              },
                              value: {
                                type: "number"
                              },
                              formatted: {
                                type: "string"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  markers: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: {
                          type: "string",
                          format: "date"
                        },
                        label: {
                          type: "string"
                        }
                      }
                    }
                  },
                  aria_description: {
                    type: "string",
                    nullable: true
                  },
                  no_data_label: {
                    type: "string"
                  },
                  cards: {
                    type: "array",
                    items: {
                      "$ref" => "#/components/schemas/AccountWorkspaceCard"
                    }
                  },
                  breakdown: {
                    type: "array",
                    items: {
                      "$ref" => "#/components/schemas/AccountWorkspaceCard"
                    }
                  },
                  notices: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  }
                },
                required: [ "title", "value", "currency", "view", "period", "series" ]
              },
              fx_warning: {
                type: "string",
                nullable: true
              },
              activity: {
                type: "object",
                properties: {
                  groups: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: {
                          type: "string",
                          format: "date"
                        },
                        label: {
                          type: "string"
                        },
                        balance: {
                          type: "string",
                          nullable: true
                        },
                        reconciliation: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              label: {
                                type: "string"
                              },
                              value: {
                                type: "string"
                              },
                              tooltip: {
                                type: "string"
                              },
                              style: {
                                type: "string"
                              }
                            }
                          }
                        },
                        entries: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: {
                                type: "string",
                                format: "uuid"
                              },
                              type: {
                                type: "string",
                                enum: [ "transaction", "trade", "valuation" ]
                              },
                              name: {
                                type: "string"
                              },
                              href: {
                                type: "string"
                              },
                              amount: {
                                type: "string"
                              },
                              positive: {
                                type: "boolean"
                              },
                              excluded: {
                                type: "boolean"
                              },
                              notes: {
                                type: "string",
                                nullable: true
                              },
                              description: {
                                type: "string",
                                nullable: true
                              },
                              activity_label: {
                                type: "string",
                                nullable: true
                              },
                              selectable: {
                                type: "boolean"
                              },
                              transaction: {
                                nullable: true,
                                allOf: [
                                  {
                                    "$ref" => "#/components/schemas/Transaction"
                                  }
                                ]
                              },
                              split_parent: {
                                type: "object",
                                properties: {
                                  id: {
                                    type: "string",
                                    format: "uuid"
                                  },
                                  name: {
                                    type: "string"
                                  },
                                  amount: {
                                    type: "string"
                                  }
                                },
                                nullable: true
                              },
                              badges: {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    label: {
                                      type: "string"
                                    },
                                    tooltip: {
                                      type: "string",
                                      nullable: true
                                    },
                                    icon: {
                                      type: "string",
                                      nullable: true
                                    }
                                  }
                                }
                              },
                              logo_url: {
                                type: "string",
                                nullable: true
                              },
                              activity_options: {
                                type: "array",
                                items: {
                                  type: "object",
                                  properties: {
                                    label: {
                                      type: "string"
                                    },
                                    value: {
                                      type: "string"
                                    }
                                  }
                                }
                              },
                              activity_edit: {
                                type: "object",
                                properties: {
                                  href: {
                                    type: "string"
                                  },
                                  entryable_id: {
                                    type: "string",
                                    format: "uuid"
                                  },
                                  convert_href: {
                                    type: "string",
                                    nullable: true
                                  }
                                },
                                nullable: true
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  pagination: {
                    type: "object",
                    properties: {
                      page: {
                        type: "integer"
                      },
                      per_page: {
                        type: "integer"
                      },
                      total_count: {
                        type: "integer"
                      },
                      total_pages: {
                        type: "integer"
                      }
                    }
                  },
                  new_actions: {
                    type: "array",
                    items: {
                      "$ref" => "#/components/schemas/AccountWorkspaceAction"
                    }
                  },
                  bulk_actions: {
                    type: "object",
                    properties: {
                      edit: {
                        type: "string"
                      },
                      delete: {
                        type: "string"
                      },
                      duplicate: {
                        type: "string"
                      }
                    }
                  }
                },
                nullable: true
              },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    key: {
                      type: "string"
                    },
                    title: {
                      type: "string",
                      nullable: true
                    },
                    description: {
                      type: "string",
                      nullable: true
                    },
                    cards: {
                      type: "array",
                      items: {
                        "$ref" => "#/components/schemas/AccountWorkspaceCard"
                      }
                    },
                    notices: {
                      type: "array",
                      items: {
                        type: "string"
                      }
                    },
                    fields: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          label: {
                            type: "string"
                          },
                          value: {
                            type: "string"
                          },
                          tooltip: {
                            type: "string",
                            nullable: true
                          }
                        }
                      }
                    },
                    table: {
                      type: "object",
                      properties: {
                        label: {
                          type: "string"
                        },
                        columns: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              key: {
                                type: "string"
                              },
                              label: {
                                type: "string"
                              },
                              numeric: {
                                type: "boolean"
                              }
                            }
                          }
                        },
                        rows: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: {
                                type: "string"
                              },
                              cells: {
                                type: "object",
                                additionalProperties: {
                                  type: "object",
                                  properties: {
                                    text: {
                                      type: "string"
                                    },
                                    secondary: {
                                      type: "string",
                                      nullable: true
                                    },
                                    href: {
                                      type: "string",
                                      nullable: true
                                    },
                                    tone: {
                                      type: "string"
                                    },
                                    privacy: {
                                      type: "boolean"
                                    },
                                    logo: {
                                      type: "object",
                                      properties: {
                                        url: {
                                          type: "string",
                                          nullable: true
                                        },
                                        text: {
                                          type: "string"
                                        }
                                      },
                                      nullable: true
                                    }
                                  }
                                }
                              },
                              actions: {
                                type: "array",
                                items: {
                                  "$ref" => "#/components/schemas/AccountWorkspaceAction"
                                }
                              },
                              past: {
                                type: "boolean"
                              }
                            }
                          }
                        },
                        empty_message: {
                          type: "string"
                        }
                      },
                      nullable: true
                    },
                    actions: {
                      type: "array",
                      items: {
                        "$ref" => "#/components/schemas/AccountWorkspaceAction"
                      }
                    },
                    progress: {
                      type: "object",
                      properties: {
                        label: {
                          type: "string"
                        },
                        percent: {
                          type: "number"
                        },
                        description: {
                          type: "string"
                        }
                      },
                      nullable: true
                    },
                    coverage: {
                      type: "object",
                      properties: {
                        years: {
                          type: "array",
                          items: {
                            type: "integer"
                          }
                        },
                        selected_year: {
                          type: "integer"
                        },
                        range: {
                          type: "string"
                        },
                        months: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              key: {
                                type: "string"
                              },
                              label: {
                                type: "string"
                              },
                              status: {
                                type: "string"
                              },
                              status_label: {
                                type: "string"
                              },
                              tone: {
                                type: "string"
                              }
                            }
                          }
                        }
                      },
                      nullable: true
                    },
                    upload: {
                      type: "object",
                      properties: {
                        href: {
                          type: "string"
                        },
                        account_id: {
                          type: "string",
                          format: "uuid"
                        },
                        accept: {
                          type: "string"
                        },
                        label: {
                          type: "string"
                        },
                        hint: {
                          type: "string"
                        },
                        submit_label: {
                          type: "string"
                        }
                      },
                      nullable: true
                    }
                  },
                  required: [ "key", "cards", "fields", "actions" ]
                }
              },
              text: {
                type: "object",
                additionalProperties: {
                  type: "string"
                }
              },
              accountable: {
                type: "object",
                nullable: true,
                additionalProperties: true
              },
              loan: {
                type: "object",
                nullable: true,
                additionalProperties: true
              }
            },
            required: [ "id", "name", "account_type", "currency", "disabled", "actions", "tabs", "active_tab", "chart", "activity", "sections", "text" ]
          },
          AccountSharing: {
            type: "object",
            properties: {
              owned: {
                type: "boolean"
              },
              owner: {
                type: "object",
                properties: {
                  name: {
                    type: "string"
                  },
                  initials: {
                    type: "string"
                  }
                },
                nullable: true
              },
              viewer_permission: {
                type: "string",
                nullable: true
              },
              member: {
                type: "object",
                properties: {
                  include_in_finances: {
                    type: "boolean"
                  }
                },
                nullable: true
              },
              permissions: {
                type: "object",
                additionalProperties: {
                  type: "string"
                }
              },
              members: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      format: "uuid"
                    },
                    name: {
                      type: "string"
                    },
                    initials: {
                      type: "string"
                    },
                    shared: {
                      type: "boolean"
                    },
                    permission: {
                      type: "string"
                    },
                    include_in_finances: {
                      type: "boolean",
                      nullable: true
                    }
                  }
                }
              },
              no_members: {
                type: "boolean"
              },
              moniker: {
                type: "string"
              },
              update_href: {
                type: "string"
              }
            },
            required: [ "owned", "owner", "viewer_permission", "member", "permissions", "members", "no_members", "moniker", "update_href" ]
          },
          AccountProviderOptions: {
            type: "object",
            properties: {
              text: {
                type: :object,
                required: %w[title description no_providers],
                properties: {
                  title: { type: :string },
                  description: { type: :string },
                  no_providers: { type: :string }
                }
              },
              providers: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: {
                      type: "string"
                    },
                    key: {
                      type: "string"
                    },
                    description: {
                      type: "string",
                      nullable: true
                    },
                    path: {
                      type: "string"
                    }
                  },
                  required: [ "name", "key", "description", "path" ]
                }
              }
            },
            required: %w[providers text]
          },
          TransferFormOptions: {
            type: "object",
            required: [ "accounts", "tags", "default_date", "idempotency_key", "text" ],
            properties: {
              accounts: {
                type: "array",
                items: {
                  type: "object",
                  required: [ "id", "name", "currency" ],
                  properties: {
                    id: {
                      type: "string",
                      format: "uuid"
                    },
                    name: {
                      type: "string"
                    },
                    currency: {
                      type: "string"
                    }
                  }
                }
              },
              tags: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/Tag"
                }
              },
              default_date: {
                type: "string",
                format: "date"
              },
              idempotency_key: {
                type: "string",
                format: "uuid"
              },
              text: {
                type: "object",
                additionalProperties: {
                  type: "string"
                }
              }
            }
          },
          ValuationWorkspace: {
            type: "object",
            required: [ "accounts", "account_id", "entry", "permissions", "date_bounds", "text" ],
            properties: {
              accounts: {
                type: "array",
                items: {
                  type: "object",
                  required: [ "id", "name", "currency", "accountable_type", "linked" ],
                  properties: {
                    id: {
                      type: "string",
                      format: "uuid"
                    },
                    name: {
                      type: "string"
                    },
                    currency: {
                      type: "string"
                    },
                    accountable_type: {
                      type: "string"
                    },
                    linked: {
                      type: "boolean"
                    }
                  }
                }
              },
              account_id: {
                type: "string",
                format: "uuid",
                nullable: true
              },
              entry: {
                type: "object",
                required: [ "id", "name", "date", "amount", "currency", "notes", "kind", "formatted_amount", "date_label" ],
                properties: {
                  id: {
                    type: "string",
                    format: "uuid",
                    nullable: true
                  },
                  name: {
                    type: "string"
                  },
                  date: {
                    type: "string",
                    format: "date"
                  },
                  amount: {
                    type: "string",
                    description: "Unformatted decimal; empty for a new entry."
                  },
                  currency: {
                    type: "string"
                  },
                  notes: {
                    type: "string",
                    nullable: true
                  },
                  kind: {
                    type: "string",
                    enum: [ "reconciliation", "opening_anchor", "current_anchor" ]
                  },
                  formatted_amount: {
                    type: "string"
                  },
                  date_label: {
                    type: "string"
                  }
                }
              },
              permissions: {
                type: "object",
                required: [ "can_edit", "can_annotate" ],
                properties: {
                  can_edit: {
                    type: "boolean"
                  },
                  can_annotate: {
                    type: "boolean"
                  }
                }
              },
              date_bounds: {
                type: "object",
                required: [ "min", "max" ],
                properties: {
                  min: {
                    type: "string",
                    format: "date"
                  },
                  max: {
                    type: "string",
                    format: "date"
                  }
                }
              },
              text: {
                type: "object",
                additionalProperties: {
                  type: "string"
                }
              }
            }
          },
          ValuationFormOptions: {
            type: "object",
            required: [ "workspace" ],
            properties: {
              workspace: {
                "$ref" => "#/components/schemas/ValuationWorkspace"
              }
            }
          },
          ValuationWithWorkspace: {
            allOf: [
              {
                "$ref" => "#/components/schemas/Valuation"
              },
              {
                type: "object",
                properties: {
                  workspace: {
                    "$ref" => "#/components/schemas/ValuationWorkspace"
                  }
                }
              }
            ]
          },
          ValuationConfirmation: {
            type: "object",
            required: [ "confirmation" ],
            properties: {
              confirmation: {
                type: "object",
                required: [ "description", "notice", "investment", "total_value", "holdings_value", "brokerage_cash", "brokerage_cash_negative" ],
                properties: {
                  description: {
                    type: "string"
                  },
                  notice: {
                    type: "string"
                  },
                  investment: {
                    type: "boolean"
                  },
                  total_value: {
                    type: "string"
                  },
                  holdings_value: {
                    type: "string",
                    nullable: true
                  },
                  brokerage_cash: {
                    type: "string",
                    nullable: true
                  },
                  brokerage_cash_negative: {
                    type: "boolean"
                  }
                }
              }
            }
          },
          HomePreferencesRequest: {
            type: "object",
            required: [ "preferences" ],
            properties: {
              preferences: {
                type: "object",
                properties: {
                  collapsed_sections: {
                    type: "object",
                    additionalProperties: {
                      type: "boolean"
                    }
                  },
                  section_order: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  },
                  dashboard_section_layout: {
                    type: "object",
                    additionalProperties: {
                      type: "object",
                      properties: {
                        height: {
                          type: "string",
                          enum: [ "compact", "auto", "tall" ]
                        },
                        col_span: {
                          type: "string",
                          enum: [ "single", "full" ]
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          HomePreferencesResponse: {
            type: "object",
            required: [ "success" ],
            properties: {
              success: {
                type: "boolean"
              }
            }
          },
          InsightAcknowledgeResponse: {
            type: "object",
            required: [ "insight" ],
            properties: {
              insight: {
                "$ref" => "#/components/schemas/Insight"
              }
            }
          },
          ReportPageRequest: {
            type: "object",
            properties: {
              limit: {
                type: "integer",
                minimum: 1,
                default: 10,
                description: "SureQL pages permit at most 100 rows; structured reports use their domain page limits."
              },
              offset: {
                type: "integer",
                minimum: 0,
                default: 0
              }
            }
          },
          ReportPage: {
            type: "object",
            required: [ "limit", "offset", "hasNext" ],
            properties: {
              limit: {
                type: "integer"
              },
              offset: {
                type: "integer"
              },
              hasNext: {
                type: "boolean"
              }
            }
          },
          ReportDimension: {
            type: "object",
            required: [ "id", "field" ],
            properties: {
              id: {
                type: "string"
              },
              field: {
                type: "string"
              },
              dateBucket: {
                type: "string",
                enum: [ "day", "week", "month", "quarter", "year" ]
              }
            }
          },
          ReportMeasure: {
            type: "object",
            required: [ "id", "field", "aggregation" ],
            properties: {
              id: {
                type: "string"
              },
              field: {
                type: "string"
              },
              aggregation: {
                type: "string",
                enum: [ "count", "count_distinct", "sum", "average", "minimum", "maximum" ]
              }
            }
          },
          ReportFilter: {
            type: "object",
            required: [ "field", "operator", "value" ],
            properties: {
              field: {
                type: "string"
              },
              operator: {
                type: "string",
                enum: [ "equals", "not_equals", "last" ]
              },
              value: {
                oneOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "integer"
                  }
                ]
              },
              unit: {
                type: "string",
                enum: [ "days" ]
              }
            }
          },
          StructuredReportDefinition: {
            type: "object",
            required: [ "version", "source", "mode", "columns", "filters", "sort" ],
            description: "Versioned transaction report. Aggregate mode also requires rows and values; detail mode uses selected detail fields only and sorts only selected fields. Amounts retain signed ledger semantics. Account filters cannot widen user access.",
            properties: {
              version: {
                type: "integer",
                enum: [ 1 ]
              },
              source: {
                type: "string",
                enum: [ "transactions" ]
              },
              mode: {
                type: "string",
                enum: [ "aggregate", "detail" ]
              },
              rows: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/ReportDimension"
                }
              },
              columns: {
                type: "array",
                items: {
                  type: "object",
                  required: [ "field" ],
                  properties: {
                    id: {
                      type: "string"
                    },
                    field: {
                      type: "string"
                    },
                    dateBucket: {
                      type: "string",
                      enum: [ "day", "week", "month", "quarter", "year" ]
                    }
                  }
                }
              },
              values: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/ReportMeasure"
                }
              },
              filters: {
                type: "array",
                maxItems: 20,
                items: {
                  "$ref" => "#/components/schemas/ReportFilter"
                }
              },
              sort: {
                type: "array",
                items: {
                  type: "object",
                  required: [ "direction" ],
                  properties: {
                    axis: {
                      type: "string",
                      enum: [ "rows", "columns" ]
                    },
                    measure: {
                      type: "string"
                    },
                    dimension: {
                      type: "string"
                    },
                    field: {
                      type: "string"
                    },
                    direction: {
                      type: "string",
                      enum: [ "asc", "desc" ]
                    }
                  }
                }
              }
            }
          },
          PivotDefinition: {
            type: "object",
            required: [ "version", "category", "measures", "sort" ],
            properties: {
              version: {
                type: "integer",
                enum: [ 1 ]
              },
              category: {
                type: "object",
                required: [ "field" ],
                properties: {
                  field: {
                    type: "string"
                  },
                  limit: {
                    type: "integer",
                    minimum: 1,
                    maximum: 24
                  },
                  dateBucket: {
                    type: "string",
                    enum: [ "day", "week", "month", "quarter", "year" ]
                  }
                }
              },
              series: {
                type: "object",
                properties: {
                  field: {
                    type: "string"
                  },
                  limit: {
                    type: "integer",
                    minimum: 1,
                    maximum: 12
                  }
                }
              },
              measures: {
                type: "array",
                minItems: 1,
                maxItems: 3,
                items: {
                  type: "object",
                  required: [ "aggregation" ],
                  properties: {
                    field: {
                      type: "string"
                    },
                    aggregation: {
                      type: "string",
                      enum: [ "count", "count_distinct", "sum", "average", "minimum", "maximum" ]
                    },
                    label: {
                      type: "string"
                    }
                  }
                }
              },
              sort: {
                type: "string",
                enum: [ "category_asc", "category_desc", "value_asc", "value_desc" ]
              },
              chartType: {
                type: "string",
                enum: [ "line", "grouped_bar", "stacked_bar", "pie" ]
              },
              valueFormat: {
                type: "string"
              }
            }
          },
          ReportExecutionRequest: {
            type: "object",
            description: "Supply one operation: source for SureQL; source+pivot for a chart pivot; report for a structured report; or catalog:true for catalog discovery. All operations are read-only and accept read scope. Pagination applies to SureQL and structured report execution. all_columns expands structured aggregate columns for chart consumers.",
            properties: {
              source: {
                type: "string"
              },
              pivot: {
                "$ref" => "#/components/schemas/PivotDefinition"
              },
              report: {
                "$ref" => "#/components/schemas/StructuredReportDefinition"
              },
              catalog: {
                type: "boolean",
                enum: [ true ]
              },
              pagination: {
                "$ref" => "#/components/schemas/ReportPageRequest"
              },
              all_columns: {
                type: "boolean"
              }
            }
          },
          ReportCatalog: {
            type: "object",
            required: [ "source", "fields" ],
            properties: {
              source: {
                type: "string",
                enum: [ "transactions" ]
              },
              fields: {
                type: "array",
                items: {
                  type: "object",
                  required: [ "key", "label", "kind", "dimension", "detail", "aggregations", "dateBuckets", "operators", "options" ],
                  properties: {
                    key: {
                      type: "string"
                    },
                    label: {
                      type: "string"
                    },
                    kind: {
                      type: "string",
                      enum: [ "text", "date", "number", "currency" ]
                    },
                    dimension: {
                      type: "boolean"
                    },
                    detail: {
                      type: "boolean"
                    },
                    aggregations: {
                      type: "array",
                      items: {
                        type: "string"
                      }
                    },
                    dateBuckets: {
                      type: "array",
                      items: {
                        type: "string"
                      }
                    },
                    operators: {
                      type: "array",
                      items: {
                        type: "string"
                      }
                    },
                    options: {
                      type: "array",
                      items: {
                        type: "object",
                        required: [ "value", "label" ],
                        properties: {
                          value: {
                            type: "string"
                          },
                          label: {
                            type: "string"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          SureqlField: {
            type: "object",
            required: [ "name", "kind", "capabilities" ],
            properties: {
              name: {
                type: "string"
              },
              db_type: {
                type: "string",
                nullable: true
              },
              kind: {
                type: "string"
              },
              nullable: {
                type: "boolean"
              },
              capabilities: {
                type: "object",
                properties: {
                  category: {
                    type: "boolean"
                  },
                  series: {
                    type: "boolean"
                  },
                  measure: {
                    type: "boolean"
                  },
                  aggregations: {
                    type: "array",
                    items: {
                      type: "string"
                    }
                  }
                }
              }
            }
          },
          SureqlResult: {
            type: "object",
            required: [ "sql", "columns", "rows", "row_count", "truncated", "fields", "pagination" ],
            properties: {
              sql: {
                type: "string"
              },
              columns: {
                type: "array",
                items: {
                  type: "string"
                }
              },
              rows: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true
                }
              },
              row_count: {
                type: "integer"
              },
              truncated: {
                type: "boolean"
              },
              fields: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/SureqlField"
                }
              },
              pagination: {
                allOf: [
                  {
                    "$ref" => "#/components/schemas/ReportPage"
                  }
                ],
                nullable: true
              }
            }
          },
          PivotResult: {
            type: "object",
            required: [ "sql", "categories", "series", "measures", "columns", "rows", "row_count", "truncated", "fields" ],
            properties: {
              sql: {
                type: "string"
              },
              categories: {
                type: "array",
                items: {
                  nullable: true
                }
              },
              series: {
                type: "array",
                items: {
                  nullable: true
                }
              },
              measures: {
                type: "array",
                items: {
                  type: "object",
                  required: [ "aggregation" ],
                  properties: {
                    field: {
                      type: "string"
                    },
                    aggregation: {
                      type: "string"
                    },
                    label: {
                      type: "string"
                    }
                  }
                }
              },
              columns: {
                type: "array",
                items: {
                  type: "string"
                }
              },
              rows: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: true
                }
              },
              row_count: {
                type: "integer"
              },
              truncated: {
                type: "boolean"
              },
              fields: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/SureqlField"
                }
              }
            }
          },
          StructuredReportResult: {
            type: "object",
            required: [ "mode", "sql", "result", "metadata", "truncated", "pagination" ],
            properties: {
              mode: {
                type: "string",
                enum: [ "aggregate", "detail" ]
              },
              sql: {
                type: "string"
              },
              result: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: {
                    oneOf: [
                      {
                        type: "string"
                      },
                      {
                        type: "number"
                      }
                    ],
                    nullable: true
                  }
                }
              },
              truncated: {
                type: "boolean"
              },
              pagination: {
                "$ref" => "#/components/schemas/ReportPage"
              },
              metadata: {
                type: "object",
                required: [ "fields", "rows" ],
                properties: {
                  fields: {
                    type: "array",
                    items: {
                      type: "object",
                      required: [ "key", "field", "label", "kind", "currency", "role" ],
                      properties: {
                        key: {
                          type: "string"
                        },
                        field: {
                          type: "string"
                        },
                        label: {
                          type: "string"
                        },
                        kind: {
                          type: "string"
                        },
                        currency: {
                          type: "string",
                          nullable: true
                        },
                        role: {
                          type: "string",
                          enum: [ "dimension", "value", "total", "detail" ]
                        },
                        measureId: {
                          type: "string"
                        },
                        columnKey: {
                          type: "string"
                        },
                        dateBucket: {
                          type: "string"
                        }
                      }
                    }
                  },
                  rows: {
                    type: "array",
                    items: {
                      type: "object",
                      required: [ "currency" ],
                      properties: {
                        id: {
                          type: "string",
                          description: "Detail entry identity"
                        },
                        key: {
                          type: "string",
                          description: "Aggregate row identity"
                        },
                        currency: {
                          type: "string"
                        },
                        values: {
                          type: "array",
                          items: {
                            nullable: true
                          }
                        },
                        labels: {
                          type: "array",
                          items: {
                            type: "string"
                          }
                        }
                      }
                    }
                  },
                  columns: {
                    type: "array",
                    items: {
                      type: "object",
                      required: [ "key", "values", "labels" ],
                      properties: {
                        key: {
                          type: "string"
                        },
                        values: {
                          type: "array",
                          items: {
                            nullable: true
                          }
                        },
                        labels: {
                          type: "array",
                          items: {
                            type: "string"
                          }
                        }
                      }
                    }
                  },
                  measures: {
                    type: "array",
                    items: {
                      type: "object",
                      required: [ "id", "label", "format", "currency" ],
                      properties: {
                        id: {
                          type: "string"
                        },
                        label: {
                          type: "string"
                        },
                        format: {
                          type: "string",
                          enum: [ "number", "currency" ]
                        },
                        currency: {
                          type: "string",
                          nullable: true
                        }
                      }
                    }
                  },
                  grouping: {
                    type: "object",
                    required: [ "rows", "columns" ],
                    properties: {
                      rows: {
                        type: "array",
                        items: {
                          "$ref" => "#/components/schemas/ReportDimension"
                        }
                      },
                      columns: {
                        type: "array",
                        items: {
                          "$ref" => "#/components/schemas/ReportDimension"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          ReportError: {
            type: "object",
            required: [ "error" ],
            properties: {
              error: {
                type: "string"
              },
              field: {
                type: "string",
                description: "Invalid report/pivot field path, when applicable"
              }
            }
          },
          CategoryWorkspaceRow: {
            type: "object",
            required: [ "id", "name", "display_name", "display_name_with_parent", "color", "lucide_icon", "parent_id", "has_parent" ],
            properties: {
              id: {
                type: "string",
                format: "uuid",
                nullable: true
              },
              name: {
                type: "string",
                nullable: true
              },
              display_name: {
                type: "string",
                nullable: true
              },
              display_name_with_parent: {
                type: "string",
                nullable: true
              },
              color: {
                type: "string"
              },
              lucide_icon: {
                type: "string"
              },
              parent_id: {
                type: "string",
                format: "uuid",
                nullable: true
              },
              has_parent: {
                type: "boolean"
              }
            }
          },
          CategoryWorkspace: {
            type: "object",
            required: [ "groups", "count", "has_transactions_by_id", "can_bootstrap", "empty", "colors", "icons" ],
            properties: {
              groups: {
                type: "array",
                items: {
                  type: "object",
                  required: [ "root", "subcategories" ],
                  properties: {
                    root: {
                      "$ref" => "#/components/schemas/CategoryWorkspaceRow"
                    },
                    subcategories: {
                      type: "array",
                      items: {
                        "$ref" => "#/components/schemas/CategoryWorkspaceRow"
                      }
                    }
                  }
                }
              },
              count: {
                type: "integer"
              },
              has_transactions_by_id: {
                type: "object",
                additionalProperties: {
                  type: "boolean"
                }
              },
              can_bootstrap: {
                type: "boolean"
              },
              empty: {
                type: "boolean"
              },
              colors: {
                type: "array",
                items: {
                  type: "string"
                }
              },
              icons: {
                type: "array",
                items: {
                  type: "string"
                }
              }
            }
          },
          CategoryFormOptions: {
            type: "object",
            required: [ "category", "colors", "icons", "parent_options" ],
            properties: {
              category: {
                allOf: [
                  {
                    "$ref" => "#/components/schemas/CategoryWorkspaceRow"
                  },
                  {
                    type: "object",
                    required: [ "is_parent", "can_assign_parent" ],
                    properties: {
                      is_parent: {
                        type: "boolean"
                      },
                      can_assign_parent: {
                        type: "boolean"
                      }
                    }
                  }
                ]
              },
              colors: {
                type: "array",
                items: {
                  type: "string"
                }
              },
              icons: {
                type: "array",
                items: {
                  type: "string"
                }
              },
              parent_options: {
                type: "array",
                items: {
                  type: "object",
                  required: [ "id", "display_name" ],
                  properties: {
                    id: {
                      type: "string",
                      format: "uuid"
                    },
                    display_name: {
                      type: "string"
                    }
                  }
                }
              }
            }
          },
          TagWorkspace: {
            type: "object",
            required: [ "tags", "colors" ],
            properties: {
              tags: {
                type: "array",
                items: {
                  allOf: [
                    {
                      "$ref" => "#/components/schemas/TagDetail"
                    },
                    {
                      type: "object",
                      required: [ "transactions_count" ],
                      properties: {
                        transactions_count: {
                          type: "integer"
                        }
                      }
                    }
                  ]
                }
              },
              colors: {
                type: "array",
                items: {
                  type: "string"
                }
              }
            }
          },
          TagFormOptions: {
            type: "object",
            required: [ "tag", "colors" ],
            properties: {
              tag: {
                type: "object",
                required: [ "id", "name", "color" ],
                properties: {
                  id: {
                    type: "string",
                    format: "uuid",
                    nullable: true
                  },
                  name: {
                    type: "string",
                    nullable: true
                  },
                  color: {
                    type: "string",
                    nullable: true
                  }
                }
              },
              colors: {
                type: "array",
                items: {
                  type: "string"
                }
              }
            }
          },
          MerchantWorkspaceRow: {
            type: "object",
            required: [ "id", "name", "type", "color", "logo_url", "source", "transactions_href", "edit_href", "destroy_href" ],
            properties: {
              id: {
                type: "string",
                format: "uuid",
                nullable: true
              },
              name: {
                type: "string",
                nullable: true
              },
              type: {
                type: "string"
              },
              color: {
                type: "string",
                nullable: true
              },
              logo_url: {
                type: "string",
                nullable: true
              },
              source: {
                type: "string",
                nullable: true
              },
              transactions_href: {
                type: "string"
              },
              edit_href: {
                type: "string"
              },
              destroy_href: {
                type: "string"
              }
            }
          },
          MerchantWorkspaceGroup: {
            type: "object",
            required: [ "items", "page", "per_page", "total_pages", "total_count", "item_count" ],
            properties: {
              items: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/MerchantWorkspaceRow"
                }
              },
              page: {
                type: "integer"
              },
              per_page: {
                type: "integer"
              },
              total_pages: {
                type: "integer"
              },
              total_count: {
                type: "integer"
              },
              item_count: {
                type: "integer"
              }
            }
          },
          MerchantWorkspace: {
            type: "object",
            required: [ "family_merchants", "provider_merchants", "unlinked", "counts", "enhance", "colors" ],
            properties: {
              family_merchants: {
                "$ref" => "#/components/schemas/MerchantWorkspaceGroup"
              },
              provider_merchants: {
                "$ref" => "#/components/schemas/MerchantWorkspaceGroup"
              },
              unlinked: {
                type: "array",
                items: {
                  "$ref" => "#/components/schemas/MerchantWorkspaceRow"
                }
              },
              counts: {
                type: "object",
                required: [ "family", "provider", "unlinked" ],
                properties: {
                  family: {
                    type: "integer"
                  },
                  provider: {
                    type: "integer"
                  },
                  unlinked: {
                    type: "integer"
                  }
                }
              },
              enhance: {
                type: "object",
                required: [ "eligible_count", "llm_available" ],
                properties: {
                  eligible_count: {
                    type: "integer"
                  },
                  llm_available: {
                    type: "boolean"
                  }
                }
              },
              colors: {
                type: "array",
                items: {
                  type: "string"
                }
              }
            }
          },
          MerchantFormOptions: {
            type: "object",
            required: [ "merchant", "colors" ],
            properties: {
              merchant: {
                allOf: [
                  {
                    "$ref" => "#/components/schemas/MerchantWorkspaceRow"
                  },
                  {
                    type: "object",
                    required: [ "website_url" ],
                    properties: {
                      website_url: {
                        type: "string",
                        nullable: true
                      }
                    }
                  }
                ]
              },
              colors: {
                type: "array",
                items: {
                  type: "string"
                }
              }
            }
          },
          MetadataMutationResult: {
            type: "object",
            required: [ "ok" ],
            properties: {
              ok: {
                type: "boolean"
              },
              merged_count: {
                type: "integer"
              },
              already_running: {
                type: "boolean"
              }
            }
          },
          MetadataMergeRequest: {
            type: "object",
            required: [ "target_id", "source_ids" ],
            properties: {
              target_id: {
                type: "string",
                format: "uuid"
              },
              source_ids: {
                type: "array",
                minItems: 1,
                items: {
                  type: "string",
                  format: "uuid"
                }
              }
            }
          },
          RuleRegistry: {
            type: :object, required: %w[filters executors], properties: {
              filters: { type: :array, items: { type: :object, required: %w[type key label operators options number_step], properties: {
                type: { type: :string }, key: { type: :string }, label: { type: :string },
                operators: { type: :array, items: { type: :array, items: {} } },
                options: { type: :array, nullable: true, items: { type: :array, items: {} } },
                number_step: { nullable: true }
              } } },
              executors: { type: :array, items: { type: :object, required: %w[type key label options], properties: {
                type: { type: :string }, key: { type: :string }, label: { type: :string },
                options: { type: :array, nullable: true, items: { type: :array, items: {} } }
              } } }
            }
          },
          RuleBuilderCondition: {
            type: :object, required: %w[id condition_type operator value sub_conditions], properties: {
              id: { type: :string, format: :uuid, nullable: true }, condition_type: { type: :string }, operator: { type: :string }, value: { type: :string, nullable: true },
              sub_conditions: { type: :array, items: { type: :object, required: %w[id condition_type operator value], properties: {
                id: { type: :string, format: :uuid, nullable: true }, condition_type: { type: :string }, operator: { type: :string }, value: { type: :string, nullable: true }
              } } }
            }
          },
          RuleBuilderResource: {
            type: :object, required: %w[id name resource_type active effective_date conditions actions], properties: {
              id: { type: :string, format: :uuid, nullable: true }, name: { type: :string, nullable: true }, resource_type: { type: :string, enum: %w[transaction] },
              active: { type: :boolean }, effective_date: { type: :string, format: :date, nullable: true },
              conditions: { type: :array, items: { '$ref' => '#/components/schemas/RuleBuilderCondition' } },
              actions: { type: :array, items: { type: :object, required: %w[id action_type value values], properties: {
                id: { type: :string, format: :uuid, nullable: true }, action_type: { type: :string }, value: { type: :string, nullable: true }, values: { type: :array, items: { type: :string } }
              } } }
            }
          },
          RuleFormOptions: {
            type: :object, required: %w[rule registry self_hosted], properties: {
              rule: { '$ref' => '#/components/schemas/RuleBuilderResource' }, registry: { '$ref' => '#/components/schemas/RuleRegistry' }, self_hosted: { type: :boolean }
            }
          },
          RuleAiEstimate: {
            type: :object, nullable: true, required: %w[model estimated_cost], properties: {
              model: { type: :string, nullable: true }, estimated_cost: { type: :number, nullable: true }
            }
          },
          RulePreview: {
            type: :object, required: %w[affected_count ai], properties: {
              affected_count: { type: :integer }, ai: { '$ref' => '#/components/schemas/RuleAiEstimate' }
            }
          },
          RuleBulkPreview: {
            type: :object, required: %w[rule_count total_affected_count ai], properties: {
              rule_count: { type: :integer }, total_affected_count: { type: :integer }, ai: { '$ref' => '#/components/schemas/RuleAiEstimate' }
            }
          },
          RulesWorkspace: {
            type: :object, required: %w[rules count sort_by direction self_hosted ai_actions_present recent_runs], properties: {
              rules: { type: :array, items: { type: :object, required: %w[id name resource_type active summary updated_at], properties: {
                id: { type: :string, format: :uuid }, name: { type: :string, nullable: true }, resource_type: { type: :string }, active: { type: :boolean }, updated_at: { type: :string, format: :'date-time' },
                summary: { type: :object, required: %w[condition additional_conditions_count action additional_actions_count scope], properties: {
                  condition: { type: :string }, additional_conditions_count: { type: :integer }, action: { type: :string }, additional_actions_count: { type: :integer }, scope: { type: :string }
                } }
              } } },
              count: { type: :integer }, sort_by: { type: :string, enum: %w[name updated_at] }, direction: { type: :string, enum: %w[asc desc] },
              self_hosted: { type: :boolean }, ai_actions_present: { type: :boolean },
              recent_runs: { type: :object, required: %w[items page pages count per_page], properties: {
                items: { type: :array, items: { type: :object, required: %w[id executed_at execution_type status rule_name queued processed modified blocked error_message], properties: {
                  id: { type: :string, format: :uuid }, executed_at: { type: :string, format: :'date-time' }, execution_type: { type: :string }, status: { type: :string }, rule_name: { type: :string },
                  queued: { type: :integer }, processed: { type: :integer }, modified: { type: :integer }, blocked: { type: :integer }, error_message: { type: :string, nullable: true }
                } } },
                page: { type: :integer }, pages: { type: :integer }, count: { type: :integer }, per_page: { type: :integer }
              } }
            }
          },
          RuleSubConditionInput: {
            type: :object, properties: {
              id: { type: :string, format: :uuid }, condition_type: { type: :string }, operator: { type: :string }, value: { type: :string, nullable: true }, _destroy: { type: :boolean }
            }
          },
          RuleConditionInput: {
            type: :object, properties: {
              id: { type: :string, format: :uuid }, condition_type: { type: :string }, operator: { type: :string }, value: { type: :string, nullable: true }, _destroy: { type: :boolean },
              sub_conditions_attributes: { oneOf: [
                { type: :object, additionalProperties: { '$ref' => '#/components/schemas/RuleSubConditionInput' } },
                { type: :array, items: { '$ref' => '#/components/schemas/RuleSubConditionInput' } }
              ] }
            }
          },
          RuleActionInput: {
            type: :object, properties: {
              id: { type: :string, format: :uuid }, action_type: { type: :string }, _destroy: { type: :boolean },
              value: { nullable: true, oneOf: [ { type: :string }, { type: :array, items: { type: :string } } ] }
            }
          },
          RuleInput: {
            type: :object, required: %w[rule], properties: {
              rule: { type: :object, properties: {
                name: { type: :string, nullable: true }, resource_type: { type: :string, enum: %w[transaction] }, active: { type: :boolean }, effective_date: { type: :string, format: :date, nullable: true },
                conditions_attributes: { oneOf: [
                  { type: :object, additionalProperties: { '$ref' => '#/components/schemas/RuleConditionInput' } },
                  { type: :array, items: { '$ref' => '#/components/schemas/RuleConditionInput' } }
                ] },
                actions_attributes: { oneOf: [
                  { type: :object, additionalProperties: { '$ref' => '#/components/schemas/RuleActionInput' } },
                  { type: :array, items: { '$ref' => '#/components/schemas/RuleActionInput' } }
                ] }
              } }
            }
          },
          AccountStatement: {
            type: :object,
            required: %w[id filename content_type byte_size source upload_status review_status currency can_manage reconciliation_status reconciliation_checks],
            properties: {
              id: { type: :string, format: :uuid }, filename: { type: :string }, content_type: { type: :string }, byte_size: { type: :integer },
              source: { type: :string, enum: %w[manual_upload] }, upload_status: { type: :string, enum: %w[stored failed] },
              review_status: { type: :string, enum: %w[unmatched linked rejected] },
              account_id: { type: :string, format: :uuid, nullable: true }, suggested_account_id: { type: :string, format: :uuid, nullable: true },
              match_confidence: { type: :string, nullable: true }, institution_name_hint: { type: :string, nullable: true },
              account_name_hint: { type: :string, nullable: true }, account_last4_hint: { type: :string, nullable: true },
              period_start_on: { type: :string, format: :date, nullable: true }, period_end_on: { type: :string, format: :date, nullable: true },
              opening_balance: { type: :string, nullable: true }, closing_balance: { type: :string, nullable: true }, currency: { type: :string },
              can_manage: { type: :boolean }, reconciliation_status: { type: :string, enum: %w[matched mismatched unavailable] },
              reconciliation_checks: { type: :array, items: { type: :object, properties: {
                key: { type: :string }, status: { type: :string }, statement_amount: { type: :string }, ledger_amount: { type: :string }, difference: { type: :string }
              } } }, download_url: { type: :string, nullable: true }, created_at: { type: :string, format: :'date-time' }
            }
          },
          AccountStatementResponse: {
            type: :object, required: %w[account_statement], properties: {
              account_statement: { '$ref' => '#/components/schemas/AccountStatement' },
              workspace: { '$ref' => '#/components/schemas/AccountStatementWorkspace' }
            }
          },
          AccountStatementCollection: {
            type: :object, required: %w[account_statements pagination], properties: {
              account_statements: { type: :array, items: { '$ref' => '#/components/schemas/AccountStatement' } },
              pagination: { type: :object, required: %w[page per_page total_count total_pages], properties: {
                page: { type: :integer }, per_page: { type: :integer }, total_count: { type: :integer }, total_pages: { type: :integer }
              } },
              workspace: { type: :object, description: 'Present only with include=workspace; Statement Vault upload options and independently paginated unmatched/linked groups.', required: %w[upload storage_used unmatched linked], properties: {
                upload: { type: :object, properties: { href: { type: :string }, accounts: { type: :array, items: { type: :object, properties: { id: { type: :string, format: :uuid }, name: { type: :string } } } }, accept: { type: :string }, max_size_mb: { type: :integer } } },
                storage_used: { type: :string },
                unmatched: { '$ref' => '#/components/schemas/AccountStatementWorkspaceGroup' }, linked: { '$ref' => '#/components/schemas/AccountStatementWorkspaceGroup' }
              } }
            }
          },
          AccountStatementWorkspaceGroup: {
            type: :object, required: %w[count items page per_page total_pages], properties: {
              count: { type: :integer }, page: { type: :integer }, per_page: { type: :integer }, total_pages: { type: :integer },
              items: { type: :array, items: { type: :object, properties: {
                id: { type: :string, format: :uuid }, filename: { type: :string }, size: { type: :string }, icon: { type: :string }, period: { type: :string }, review_status: { type: :string }, account: { type: :string, nullable: true },
                suggestion: { type: :object, nullable: true, properties: { id: { type: :string, format: :uuid }, name: { type: :string }, confidence: { type: :string } } },
                href: { type: :string }, download_href: { type: :string, nullable: true }, link_href: { type: :string, nullable: true }, reject_href: { type: :string, nullable: true }
              } } }
            }
          },
          AccountStatementWorkspace: {
            type: :object, description: 'Present only with include=workspace; localized metadata, reconciliation checks and API action URLs.',
            required: %w[id filename can_manage metadata reconciliation accounts actions], properties: {
              id: { type: :string, format: :uuid }, filename: { type: :string }, can_manage: { type: :boolean }, status: { type: :string }, status_label: { type: :string }, size: { type: :string }, content_type: { type: :string },
              download_href: { type: :string, nullable: true }, destroy_href: { type: :string },
              confirm_delete: { type: :object, properties: { title: { type: :string }, body: { type: :string }, confirmText: { type: :string }, variant: { type: :string } } },
              account: { type: :object, nullable: true, properties: { id: { type: :string, format: :uuid }, name: { type: :string } } },
              suggested_account: { type: :object, nullable: true, properties: { id: { type: :string, format: :uuid }, name: { type: :string }, confidence: { type: :string } } },
              period: { type: :string }, balances: { type: :object, properties: { opening: { type: :string }, closing: { type: :string } } },
              metadata: { type: :object, properties: {
                institution_name: { type: :string, nullable: true }, account_name: { type: :string, nullable: true }, account_last4: { type: :string, nullable: true }, currency: { type: :string },
                period_start_on: { type: :string, format: :date, nullable: true }, period_end_on: { type: :string, format: :date, nullable: true }, opening_balance: { type: :string, nullable: true }, closing_balance: { type: :string, nullable: true }
              } },
              reconciliation: { type: :array, items: { type: :object, properties: { label: { type: :string }, status: { type: :string }, status_label: { type: :string }, amounts: { type: :object, properties: { statement: { type: :string }, ledger: { type: :string }, difference: { type: :string } } } } } },
              actions: { type: :object, properties: { link_href: { type: :string }, unlink_href: { type: :string }, reject_href: { type: :string } } },
              accounts: { type: :array, items: { type: :object, properties: { id: { type: :string, format: :uuid }, name: { type: :string } } } }
            }
          },
          AccountStatementUploadResult: {
            type: :object, required: %w[account_statements duplicates duplicate_count errors], properties: {
              account_statements: { type: :array, items: { '$ref' => '#/components/schemas/AccountStatement' } },
              duplicates: { type: :array, items: { '$ref' => '#/components/schemas/AccountStatement' }, description: 'Only duplicates the caller can view; inaccessible files yield generic upload errors.' },
              duplicate_count: { type: :integer, description: 'Number of visible duplicates; equals duplicates.length.' }, errors: { type: :array, items: { type: :string } }
            }
          },
          AccountStatementCoverage: {
            type: :object, required: %w[account_id year available_years summary months], properties: {
              account_id: { type: :string, format: :uuid }, year: { type: :integer }, available_years: { type: :array, items: { type: :integer } },
              summary: { type: :object, additionalProperties: { type: :integer } },
              months: { type: :array, items: { type: :object, required: %w[month status reconciliation_status statement_ids unconfirmed_statement_ids], properties: {
                month: { type: :string }, status: { type: :string, enum: %w[covered mismatched missing ambiguous duplicate not_expected] }, reconciliation_status: { type: :string, nullable: true, enum: %w[matched mismatched unavailable] },
                statement_ids: { type: :array, items: { type: :string, format: :uuid } }, unconfirmed_statement_ids: { type: :array, items: { type: :string, format: :uuid } }
              } } }
            }
          },
          ChatWorkspaceMetadata: {
              type: :object,
              required: %w[ai_enabled ai_available default_model worker_healthy demo_warning response_timeout_ms],
              properties: {
                ai_enabled: { type: :boolean },
                ai_available: { type: :boolean },
                default_model: { type: :string },
                worker_healthy: { type: :boolean },
                demo_warning: { type: :boolean },
                response_timeout_ms: { type: :integer, minimum: 30000, description: 'Configured client watchdog timeout; the server independently enforces its own age floor.' }
              }
            },
            ChatIndexWorkspace: {
              allOf: [
                { '$ref' => '#/components/schemas/ChatWorkspaceMetadata' },
                { type: :object, required: %w[chats], properties: {
                  chats: { type: :array, description: 'Complete owner-only chat list, empty until AI is enabled.', items: { '$ref' => '#/components/schemas/ChatSummary' } }
                } }
              ]
            },
            ChatDetailWorkspace: {
              allOf: [
                { '$ref' => '#/components/schemas/ChatWorkspaceMetadata' },
                { type: :object, required: %w[debug_mode technical_error needs_response messages], properties: {
                  debug_mode: { type: :boolean },
                  technical_error: { type: :string, nullable: true, description: 'Only populated when AI debug mode is enabled.' },
                  needs_response: { type: :boolean },
                  messages: { type: :array, description: 'Complete ordered conversation excluding failed partial responses. Tool payloads are hidden unless AI debug mode is enabled.', items: { '$ref' => '#/components/schemas/Message' } }
                } }
              ]
            },
            ChatFormOptions: {
              allOf: [
                { '$ref' => '#/components/schemas/ChatWorkspaceMetadata' },
                { type: :object, required: %w[chat], properties: {
                  chat: { type: :object, required: %w[id title], properties: {
                    id: { type: :string, nullable: true }, title: { type: :string }
                  } }
                } }
              ]
            },
          SimplefinHistoryAuditRequest: {
            type: :object,
            description: 'Choose a period of 1–45 days (default 45), initially ending today. Send cursor alone to visit remaining connections in that period, then the preceding period, down to 1970-01-01.',
            properties: {
              period_days: { type: :integer, minimum: 1, maximum: 45, default: 45 },
              cursor: { type: :string, nullable: true }
            }
          },
          SimplefinHistoryAuditCandidate: {
            type: :object, required: %w[entry_id transaction_id name date amount currency source parent_entry_id],
            properties: {
              entry_id: { type: :string, format: :uuid },
              transaction_id: { type: :string, format: :uuid },
              name: { type: :string },
              date: { type: :string, format: :date },
              amount: { type: :string, description: 'Signed ledger amount: positive outflow, negative inflow' },
              currency: { type: :string },
              source: { type: :string, nullable: true },
              parent_entry_id: { type: :string, format: :uuid, nullable: true }
            }
          },
          SimplefinHistoryAudit: {
            type: :object, required: %w[account_id read_only coverage feeds transactions summary warnings next_cursor retry_cursor],
            properties: {
              account_id: { type: :string, format: :uuid },
              read_only: { type: :boolean, enum: [ true ], description: 'No ledger, balance, mapping, payload-cache, or sync-timestamp changes. Support diagnostics may be recorded.' },
              coverage: {
                type: :object,
                required: %w[period_days has_more_connections window_start_date window_end_date simplefin_item_id page_complete provider_history_complete],
                properties: {
                  period_days: { type: :integer, minimum: 1, maximum: 45 },
                  has_more_connections: { type: :boolean, description: 'Continue this period before moving to the preceding period' },
                  window_start_date: { type: :string, format: :date },
                  window_end_date: { type: :string, format: :date },
                  simplefin_item_id: { type: :string, format: :uuid },
                  page_complete: { type: :boolean, description: 'All requested feeds returned valid transaction lists without provider errors or unresolved rows' },
                  provider_history_complete: { type: :boolean, enum: [ false ], description: 'SimpleFIN cannot certify complete bank history, even for an empty successful page' }
                }
              },
              feeds: {
                type: :array, items: {
                  type: :object, required: %w[simplefin_account_id provider_account_id name retired returned transaction_count],
                  properties: {
                    simplefin_account_id: { type: :string, format: :uuid },
                    provider_account_id: { type: :string },
                    name: { type: :string },
                    retired: { type: :boolean },
                    returned: { type: :boolean },
                    transaction_count: { type: :integer }
                  }
                }
              },
              transactions: {
                type: :array, items: {
                  type: :object,
                  required: %w[simplefin_account_id provider_transaction_id external_id date name amount currency entry_id transaction_id possible_matches status import_token],
                  properties: {
                    simplefin_account_id: { type: :string, format: :uuid },
                    provider_transaction_id: { type: :string, nullable: true },
                    external_id: { type: :string, nullable: true },
                    date: { type: :string, format: :date, nullable: true },
                    name: { type: :string, nullable: true },
                    amount: { type: :string, nullable: true, description: 'Signed ledger amount, not provider sign convention' },
                    currency: { type: :string, nullable: true },
                    entry_id: { type: :string, format: :uuid, nullable: true },
                    transaction_id: { type: :string, format: :uuid, nullable: true },
                    possible_matches: { type: :array, items: { '$ref' => '#/components/schemas/SimplefinHistoryAuditCandidate' } },
                    status: { type: :string, enum: %w[recorded intentionally_deleted possible_match missing pending invalid identity_conflict] },
                    import_token: { type: :string, nullable: true, description: 'One-hour, account/feed-bound authorization for an explicit import/link decision. Present only for missing or possible_match; audit remains read-only.' }
                  }
                }
              },
              summary: {
                type: :object,
                required: %w[recorded intentionally_deleted possible_match missing pending invalid identity_conflict],
                properties: %w[recorded intentionally_deleted possible_match missing pending invalid identity_conflict].to_h { |status| [ status, { type: :integer, minimum: 0 } ] }
              },
              warnings: {
                type: :array, items: {
                  type: :object, required: %w[code message],
                  properties: {
                    code: { type: :string },
                    message: { type: :string },
                    simplefin_account_id: { type: :string, format: :uuid }
                  }
                }
              },
              next_cursor: { type: :string, nullable: true, description: 'Next connection/window, even after an empty or partial page. Null means the requested range was traversed, not that bank history is complete.' },
              retry_cursor: { type: :string, nullable: true, description: 'Revisit this partial page without losing the next-page cursor. Stop on provider errors or quota warnings and retry later.' }
            }
          },
          SimplefinHistoryAuditImportRequest: {
            type: :object, required: %w[decisions],
            properties: {
              decisions: {
                type: :array, minItems: 1,
                items: {
                  type: :object, required: %w[token entry_id],
                  properties: {
                    token: { type: :string, description: 'Unexpired import_token from a missing/possible_match audit row' },
                    entry_id: { type: :string, format: :uuid, nullable: true, description: 'Explicit null imports a separate transaction; a reviewed candidate UUID only adds a protected provider alias without changing the entry.' }
                  }
                }
              }
            }
          },
          SimplefinHistoryAuditImport: {
            type: :object, required: %w[transactions],
            properties: {
              transactions: {
                type: :array,
                items: {
                  type: :object, required: %w[simplefin_account_id provider_transaction_id entry_id transaction_id],
                  properties: {
                    simplefin_account_id: { type: :string, format: :uuid },
                    provider_transaction_id: { type: :string },
                    entry_id: { type: :string, format: :uuid },
                    transaction_id: { type: :string, format: :uuid }
                  }
                }
              }
            }
          },
          ProviderReplacementAccount: {
            type: :object, required: %w[id name currency],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              currency: { type: :string }
            }
          },
          ProviderReplacementEntry: {
            type: :object, required: %w[id name date amount currency pending split transfer],
            properties: {
              id: { type: :string, description: 'Ledger entry UUID or raw provider identity reference' },
              name: { type: :string },
              date: { type: :string, format: :date },
              amount: { type: :string },
              currency: { type: :string },
              pending: { type: :boolean },
              split: { type: :boolean },
              transfer: { type: :boolean }
            }
          },
          ProviderReplacementMatch: {
            type: :object, required: %w[incoming_id survivor_id],
            properties: {
              incoming_id: { type: :string },
              survivor_id: { type: :string, format: :uuid }
            }
          },
          ProviderReplacementCandidates: {
            type: :object, required: %w[account candidates],
            properties: {
              account: { '$ref' => '#/components/schemas/ProviderReplacementAccount' },
              candidates: {
                type: :array,
                items: {
                  type: :object, required: %w[id name currency account_type linked_account],
                  properties: {
                    id: { type: :string, format: :uuid },
                    name: { type: :string },
                    currency: { type: :string },
                    balance: { type: :string, nullable: true },
                    account_type: { type: :string },
                    linked_account: {
                      type: :object, nullable: true,
                      properties: { id: { type: :string, format: :uuid }, name: { type: :string } }
                    }
                  }
                }
              },
              text: { type: :object, additionalProperties: { type: :string } }
            }
          },
          ProviderReplacementPreview: {
            type: :object,
            required: %w[fingerprint account replacement canonical_entries incoming_entries suggested_matches blockers warnings balance summary],
            properties: {
              fingerprint: { type: :string, description: 'Snapshot token; apply rejects reviews made stale by changes' },
              account: { '$ref' => '#/components/schemas/ProviderReplacementAccount' },
              replacement: { '$ref' => '#/components/schemas/ProviderReplacementAccount' },
              source_account: {
                type: :object, nullable: true,
                properties: { id: { type: :string, format: :uuid }, name: { type: :string } }
              },
              canonical_entries: { type: :array, description: 'Existing entries sorted newest first', items: { '$ref' => '#/components/schemas/ProviderReplacementEntry' } },
              incoming_entries: { type: :array, description: 'Incoming entries sorted newest first', items: { '$ref' => '#/components/schemas/ProviderReplacementEntry' } },
              suggested_matches: {
                type: :array, description: 'Suggestions for review only; apply merges only the explicitly submitted matches',
                items: {
                  allOf: [
                    { '$ref' => '#/components/schemas/ProviderReplacementMatch' },
                    {
                      type: :object, properties: {
                        reason: { type: :string },
                        preselect: {
                          type: :boolean,
                          description: 'UI default only: a unique one-to-one match with the same signed amount, currency and date, similar names, and compatible metadata'
                        }
                      }
                    }
                  ]
                }
              },
              blockers: { type: :array, items: { type: :string } },
              warnings: { type: :array, items: { type: :string } },
              balance: {
                type: :object,
                properties: {
                  current: { type: :string },
                  expected: { type: :string, nullable: true },
                  replacement: { type: :string },
                  currency: { type: :string },
                  discrepancy: { type: :string, nullable: true }
                }
              },
              summary: {
                type: :object,
                properties: { incoming_count: { type: :integer }, candidate_count: { type: :integer } }
              }
            }
          },
          ProviderReplacementRequest: {
            type: :object, required: %w[simplefin_account_id],
            properties: {
              simplefin_account_id: { type: :string, format: :uuid },
              matches: { type: :array, items: { '$ref' => '#/components/schemas/ProviderReplacementMatch' } }
            }
          },
          ProviderReplacementApplyRequest: {
            allOf: [
              { '$ref' => '#/components/schemas/ProviderReplacementRequest' },
              {
                type: :object, required: %w[fingerprint idempotency_key],
                properties: {
                  fingerprint: { type: :string },
                  idempotency_key: { type: :string, maxLength: 255 },
                  accept_balance_difference: {
                    type: :boolean, default: false,
                    description: 'Explicitly acknowledge the displayed provider-versus-ledger balance difference'
                  }
                }
              }
            ]
          },
          ProviderReplacementResult: {
            type: :object, required: %w[account_id operation_id],
            properties: {
              account_id: { type: :string, format: :uuid },
              operation_id: { type: :string, format: :uuid }
            }
          },
          Pagination: {
            type: :object,
            required: %w[page per_page total_count total_pages],
            properties: {
              page: { type: :integer, minimum: 1 },
              per_page: { type: :integer, minimum: 1 },
              total_count: { type: :integer, minimum: 0 },
              total_pages: { type: :integer, minimum: 0 }
            }
          },
          FamilyExportFile: {
            type: :object,
            required: %w[attached],
            properties: {
              attached: { type: :boolean },
              byte_size: { type: :integer, nullable: true, minimum: 0 },
              content_type: { type: :string, nullable: true }
            }
          },
          FamilyExport: {
            type: :object,
            required: %w[id status filename downloadable file created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              status: { type: :string, enum: %w[pending processing completed failed] },
              filename: { type: :string },
              downloadable: { type: :boolean },
              download_path: { type: :string, nullable: true },
              file: { '$ref' => '#/components/schemas/FamilyExportFile' },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          FamilyExportResponse: {
            type: :object,
            required: %w[data],
            properties: {
              data: { '$ref' => '#/components/schemas/FamilyExport' }
            }
          },
          FamilyExportCollection: {
            type: :object,
            required: %w[data meta],
            properties: {
              data: {
                type: :array,
                maxItems: 100,
                items: { '$ref' => '#/components/schemas/FamilyExport' }
              },
              meta: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          ErrorResponse: {
            type: :object,
            required: %w[error],
            properties: {
              error: { type: :string },
              message: { type: :string, nullable: true },
              details: {
                oneOf: [
                  { type: :array, items: { type: :string } },
                  { type: :object }
                ],
                nullable: true
              },
              errors: {
                type: :array,
                items: { type: :string },
                nullable: true,
                description: 'Validation error messages (alternative to details used by trades, valuations, etc.)'
              }
            }
          },
          ErrorResponseWithImportId: {
            type: :object,
            required: %w[error import_id],
            properties: {
              error: { type: :string },
              message: { type: :string, nullable: true },
              import_id: {
                type: :string,
                format: :uuid,
                description: 'Import ID preserved for retry or inspection after upload succeeds but publish fails'
              }
            }
          },
          MfaRequiredResponse: {
            type: :object,
            required: %w[error mfa_required],
            properties: {
              error: { type: :string },
              mfa_required: { type: :boolean }
            }
          },
          ToolCall: {
            type: :object,
            required: %w[id function_name function_arguments created_at],
            properties: {
              id: { type: :string, format: :uuid },
              function_name: { type: :string },
              function_arguments: { type: :object, additionalProperties: true },
              function_result: { type: :object, additionalProperties: true, nullable: true },
              created_at: { type: :string, format: :'date-time' }
            }
          },
          Message: {
            type: :object,
            required: %w[id type role content created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              type: { type: :string, enum: %w[user_message assistant_message] },
              role: { type: :string, enum: %w[user assistant] },
              content: { type: :string },
              model: { type: :string, nullable: true },
              pending: { type: :boolean },
              reasoning: { type: :boolean },
              status: { type: :string, enum: %w[pending complete failed] },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' },
              tool_calls: {
                type: :array,
                items: { '$ref' => '#/components/schemas/ToolCall' },
                nullable: true
              }
            }
          },
          MessageResponse: {
            allOf: [
              { '$ref' => '#/components/schemas/Message' },
              {
                type: :object,
                required: %w[chat_id],
                properties: {
                  chat_id: { type: :string, format: :uuid },
                  ai_response_status: { type: :string, enum: %w[pending complete failed], nullable: true },
                  ai_response_message: { type: :string, nullable: true }
                }
              }
            ]
          },
          ChatResource: {
            type: :object,
            required: %w[id title created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              title: { type: :string },
              error: { type: :string, nullable: true },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          ChatSummary: {
            allOf: [
              { '$ref' => '#/components/schemas/ChatResource' },
              {
                type: :object,
                required: %w[message_count],
                properties: {
                  message_count: { type: :integer, minimum: 0 },
                  last_message_at: { type: :string, format: :'date-time', nullable: true }
                }
              }
            ]
          },
          ChatDetail: {
            allOf: [
              { '$ref' => '#/components/schemas/ChatResource' },
              {
                type: :object,
                required: %w[messages],
                properties: {
                  workspace: { '$ref' => '#/components/schemas/ChatDetailWorkspace' },
                  messages: {
                    type: :array,
                    items: { '$ref' => '#/components/schemas/Message' }
                  },
                  pagination: {
                    '$ref' => '#/components/schemas/Pagination',
                    nullable: true
                  }
                }
              }
            ]
          },
          ChatCollection: {
            type: :object,
            required: %w[chats pagination],
            properties: {
              workspace: { '$ref' => '#/components/schemas/ChatIndexWorkspace' },
              chats: {
                type: :array,
                items: { '$ref' => '#/components/schemas/ChatSummary' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          Insight: {
            type: :object,
            required: %w[id type title body priority status],
            properties: {
              id: { type: :string, format: :uuid },
              type: { type: :string },
              title: { type: :string },
              body: { type: :string },
              priority: { type: :string, enum: %w[high medium low] },
              status: { type: :string, enum: %w[active read] },
              generated_at: { type: :string, format: :'date-time', nullable: true }
            }
          },
          InsightCollection: {
            type: :object,
            required: %w[insights],
            properties: {
              insights: { type: :array, items: { '$ref' => '#/components/schemas/Insight' } }
            }
          },
          PushSubscriptionRegistration: {
            type: :object, required: %w[token environment platform],
            properties: {
              token: { type: :string, maxLength: 2048, pattern: "^(?:[0-9a-fA-F]{2})+$" },
              environment: { type: :string, enum: %w[sandbox production] },
              platform: { type: :string, enum: %w[ios] },
              device_key: { type: :string, pattern: '^[0-9a-f]{64}$', description: 'Optional 256-bit installation secret, unique per server and kept in device secure storage. Required proof to replace another user’s registration for this device. Never returned.' }
            }
          },
          PushSubscription: {
            type: :object,
            required: %w[id environment platform last_registered_at],
            properties: {
              id: { type: :string, format: :uuid },
              environment: { type: :string, enum: %w[sandbox production] },
              platform: { type: :string, enum: %w[ios] },
              last_registered_at: { type: :string, format: :'date-time' }
            }
          },
          RetryResponse: {
            type: :object,
            required: %w[message message_id],
            properties: {
              message: { type: :string },
              message_id: { type: :string, format: :uuid }
            }
          },
          AccountPermissions: {
            type: :object,
            required: %w[can_edit can_annotate],
            properties: {
              can_edit: { type: :boolean, description: 'Whether the viewer owns the account or has full control.' },
              can_annotate: { type: :boolean, description: 'Whether the viewer can change category, merchant, tags, and notes.' }
            }
          },
          TransferPermissions: {
            type: :object,
            required: %w[can_edit],
            properties: {
              can_edit: { type: :boolean, description: 'Whether the viewer can change the transfer through its outflow account.' }
            }
          },
          Account: {
            type: :object,
            required: %w[id name account_type],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              account_type: { type: :string, nullable: true },
              status: { type: :string },
              linked: { type: :boolean },
              provider_links: { type: :array, items: { '$ref' => '#/components/schemas/AccountProviderLink' } },
              path: { type: :string, nullable: true, description: 'Web app URL for the account, present in transaction list responses.' }
            }
          },
          AccountDetail: {
            type: :object,
            required: %w[id name balance balance_cents cash_balance cash_balance_cents currency classification account_type status permissions created_at updated_at],
            properties: {
              workspace: { '$ref' => '#/components/schemas/AccountWorkspace' },
              linked: { type: :boolean },
              provider_links: { type: :array, items: { '$ref' => '#/components/schemas/AccountProviderLink' } },
              id: { type: :string, format: :uuid },
              name: { type: :string },
              balance: { type: :string },
              balance_cents: { type: :integer, description: 'Signed balance in minor currency units' },
              cash_balance: { type: :string },
              cash_balance_cents: { type: :integer, description: 'Signed cash balance in minor currency units' },
              currency: { type: :string },
              classification: { type: :string },
              account_type: { type: :string, nullable: true },
              subtype: { type: :string, nullable: true },
              status: { type: :string, enum: %w[active draft disabled pending_deletion] },
              permissions: { '$ref' => '#/components/schemas/AccountPermissions' },
              institution_name: { type: :string, nullable: true },
              institution_domain: { type: :string, nullable: true },
              notes: { type: :string, nullable: true },
              exclude_from_reports: { type: :boolean },
              enable_category_matcher: { type: :boolean },
              accountable: { '$ref' => '#/components/schemas/AccountableDetails' },
              address: { '$ref' => '#/components/schemas/AccountAddress' },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          AccountCollection: {
            type: :object,
            required: %w[accounts pagination],
            properties: {
              workspace: { '$ref' => '#/components/schemas/AccountsWorkspace' },
              accounts: {
                type: :array,
                items: { '$ref' => '#/components/schemas/AccountDetail' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          AccountCreateRequest: {
            type: :object,
            required: %w[account],
            properties: {
              account: {
                type: :object,
                required: %w[name balance account_type],
                properties: {
                  name: { type: :string },
                  balance: { type: :number, description: 'Current/opening balance in major currency units' },
                  currency: { type: :string, description: 'ISO currency code; defaults to the family currency' },
                  account_type: {
                    type: :string,
                    enum: %w[depository investment crypto property vehicle other_asset credit_card loan other_liability]
                  },
                  subtype: { type: :string, nullable: true },
                  opening_balance_date: { type: :string, format: :date, nullable: true },
                  institution_name: { type: :string, nullable: true },
                  institution_domain: { type: :string, nullable: true },
                  notes: { type: :string, nullable: true },
                  exclude_from_reports: { type: :boolean },
                  enable_category_matcher: { type: :boolean },
                  accountable: {
                    '$ref' => '#/components/schemas/AccountableCreateDetails'
                  }
                }
              }
            }
          },
          AccountableCreateDetails: {
            type: :object,
            description: 'Type-specific manual account fields. Fields that do not apply to account_type are ignored.',
            properties: {
              tax_treatment: { type: :string, enum: %w[taxable tax_deferred tax_exempt] },
              year_built: { type: :integer },
              area_unit: { type: :string },
              area_value: { type: :integer },
              make: { type: :string },
              model: { type: :string },
              year: { type: :integer },
              mileage_value: { type: :integer },
              mileage_unit: { type: :string },
              available_credit: { type: :number },
              minimum_payment: { type: :number },
              payment_due_day: { type: :integer, minimum: 1, maximum: 31, nullable: true, description: 'Credit cards only: confirmed monthly due day. Clear to disable automatic statement payments; short months clamp to their last day. Changes recalculate unpaid estimated statements due today or later, preserving past statements and recorded payments.' },
              minimum_payment_only: { type: :boolean, default: false, description: 'Credit cards only: estimate minimum payments using the requested Citi 1% approximation instead of the default full statement payment. This is not an issuer-accurate formula: no additional issuer floors, interest or fees are modeled. Existing minimum_payment currency metadata is not used, and the full statement balance is unchanged. A payment_due_day is still required to enable estimates. Bank autopay instructions are unchanged.' },
              apr: { type: :number },
              annual_fee: { type: :number },
              expiration_date: { type: :string, format: :date },
              rate_type: { type: :string },
              interest_rate: { type: :number },
              term_months: { type: :integer },
              initial_balance: { type: :number },
              start_date: { type: :string, format: :date },
              down_payment: { type: :number },
              insurance_rate: { type: :number },
              insurance_rate_type: { type: :string },
              rate_changes: {
                type: :array,
                items: {
                  type: :object,
                  properties: {
                    effective_date: { type: :string, format: :date },
                    rate: { type: :number }
                  }
                }
              },
              subtype: { type: :string, nullable: true, description: 'Nested subtype (native form shape); top-level subtype is preferred.' },
              address: {
                type: :object,
                properties: {
                  line1: { type: :string },
                  line2: { type: :string },
                  locality: { type: :string },
                  region: { type: :string },
                  country: { type: :string },
                  postal_code: { type: :string },
                  county: { type: :string }
                }
              }
            }
          },
          AccountUpdateRequest: {
            type: :object,
            required: %w[account],
            properties: {
              account: {
                type: :object,
                properties: {
                  name: { type: :string },
                  balance: { type: :number, description: 'New current balance in major currency units; applied via a valuation when changed' },
                  currency: { type: :string },
                  subtype: { type: :string, nullable: true },
                  institution_name: { type: :string, nullable: true },
                  institution_domain: { type: :string, nullable: true },
                  notes: { type: :string, nullable: true },
                  exclude_from_reports: { type: :boolean },
                  enable_category_matcher: { type: :boolean },
                  accountable: {
                    '$ref' => '#/components/schemas/AccountableCreateDetails'
                  }
                }
              }
            }
          },
          AccountableDetails: {
            type: :object,
            description: 'Type-specific account fields serialized for SPA edit prefill. Only the fields for the account type are present.',
            properties: {
              subtype: { type: :string, nullable: true },
              tax_treatment: { type: :string, nullable: true },
              year_built: { type: :integer, nullable: true },
              area_unit: { type: :string, nullable: true },
              area_value: { type: :integer, nullable: true },
              make: { type: :string, nullable: true },
              model: { type: :string, nullable: true },
              year: { type: :integer, nullable: true },
              mileage_value: { type: :integer, nullable: true },
              mileage_unit: { type: :string, nullable: true },
              available_credit: { type: :string, nullable: true },
              minimum_payment: { type: :string, nullable: true },
              payment_due_day: { type: :integer, minimum: 1, maximum: 31, nullable: true },
              minimum_payment_only: { type: :boolean },
              payment_due_day_source: { type: :string, nullable: true, enum: %w[manual], readOnly: true },
              statement_gap_days: { type: :integer, readOnly: true, description: 'Assumed days from statement close to payment; currently 25.' },
              apr: { type: :string, nullable: true },
              annual_fee: { type: :string, nullable: true },
              expiration_date: { type: :string, format: :date, nullable: true },
              rate_type: { type: :string, nullable: true },
              interest_rate: { type: :string, nullable: true },
              term_months: { type: :integer, nullable: true },
              initial_balance: { type: :string, nullable: true },
              start_date: { type: :string, format: :date, nullable: true },
              down_payment: { type: :string, nullable: true },
              insurance_rate: { type: :string, nullable: true },
              insurance_rate_type: { type: :string, nullable: true },
              rate_changes: {
                type: :array,
                items: {
                  type: :object,
                  properties: {
                    effective_date: { type: :string, format: :date },
                    rate: { type: :string }
                  }
                }
              }
            }
          },
          AccountAddress: {
            type: :object,
            nullable: true,
            description: 'Property address; null for all other account types.',
            properties: {
              line1: { type: :string, nullable: true },
              line2: { type: :string, nullable: true },
              locality: { type: :string, nullable: true },
              region: { type: :string, nullable: true },
              country: { type: :string, nullable: true },
              postal_code: { type: :string, nullable: true },
              county: { type: :string, nullable: true }
            }
          },
          PropertyFormOptions: {
            type: :object,
            required: %w[subtypes area_units avm_providers currencies default_currency],
            properties: {
              subtypes: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string },
                    short_label: { type: :string, nullable: true }
                  }
                }
              },
              area_units: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string }
                  }
                }
              },
              avm_providers: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string }
                  }
                }
              },
              currencies: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string }
                  }
                }
              },
              default_currency: { type: :string }
            }
          },
          PropertyAvmProviders: {
            type: :object,
            required: %w[providers],
            properties: {
              providers: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string }
                  }
                }
              }
            }
          },
          PropertyAvmPreview: {
            type: :object,
            required: %w[provider_key preview preview_token],
            properties: {
              provider_key: { type: :string },
              preview: {
                type: :object,
                properties: {
                  valuation: { type: :string },
                  currency: { type: :string },
                  property_type: { type: :string, nullable: true },
                  year_built: { type: :integer, nullable: true },
                  area_value: { type: :integer, nullable: true },
                  area_unit: { type: :string }
                }
              },
              preview_token: { type: :string }
            }
          },
          PropertyAccountRef: {
            type: :object,
            required: %w[id status],
            properties: {
              id: { type: :string, format: :uuid },
              status: { type: :string }
            }
          },
          AccountFormOptions: {
            type: :object,
            required: %w[account_types subtypes tax_treatments loan_rate_types loan_insurance_rate_types mileage_units currencies default_currency],
            properties: {
              account_types: {
                type: :array,
                description: 'All account picker types, including Property, which uses its own form-options endpoint.',
                items: {
                  type: :object,
                  required: %w[value label classification icon color],
                  properties: {
                    value: { type: :string },
                    label: { type: :string },
                    classification: { type: :string, enum: %w[asset liability] },
                    icon: { type: :string },
                    color: { type: :string }
                  }
                }
              },
              subtypes: {
                type: :object,
                description: 'Subtype options for generic account forms; Property options are served by /api/v1/properties/form_options.',
                properties: {
                  depository: { '$ref' => '#/components/schemas/AccountSubtypeOptions' },
                  investment: { '$ref' => '#/components/schemas/AccountSubtypeOptions' },
                  crypto: { '$ref' => '#/components/schemas/AccountSubtypeOptions' },
                  vehicle: { '$ref' => '#/components/schemas/AccountSubtypeOptions' },
                  other_asset: { '$ref' => '#/components/schemas/AccountSubtypeOptions' },
                  credit_card: { '$ref' => '#/components/schemas/AccountSubtypeOptions' },
                  loan: { '$ref' => '#/components/schemas/AccountSubtypeOptions' },
                  other_liability: { '$ref' => '#/components/schemas/AccountSubtypeOptions' }
                }
              },
              tax_treatments: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string },
                    description: { type: :string, nullable: true }
                  }
                }
              },
              loan_rate_types: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string }
                  }
                }
              },
              loan_insurance_rate_types: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string }
                  }
                }
              },
              mileage_units: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string }
                  }
                }
              },
              currencies: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[value label],
                  properties: {
                    value: { type: :string },
                    label: { type: :string }
                  }
                }
              },
              default_currency: { type: :string }
            }
          },
          AccountSubtypeOptions: {
            type: :array,
            items: {
              type: :object,
              required: %w[value label],
              properties: {
                value: { type: :string },
                label: { type: :string },
                short_label: { type: :string, nullable: true },
                group: { type: :string, nullable: true, description: 'Region label for investment subtypes; null otherwise' }
              }
            }
          },
          AccountLinkOptions: {
            type: :object,
            required: %w[account_type manual_path manual_label providers],
            properties: {
              account_type: { type: :string },
              manual_path: { type: :string },
              manual_label: { type: :string },
              providers: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[key name new_account_path],
                  properties: {
                    key: { type: :string },
                    name: { type: :string },
                    new_account_path: { type: :string }
                  }
                }
              }
            }
          },
          FamilySettings: {
            type: :object,
            required: %w[id currency locale date_format month_start_day moniker default_account_sharing custom_enabled_currencies enabled_currencies created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string, nullable: true },
              currency: { type: :string },
              locale: { type: :string },
              date_format: { type: :string },
              country: { type: :string, nullable: true },
              timezone: { type: :string, nullable: true },
              month_start_day: { type: :integer, minimum: 1, maximum: 28 },
              moniker: { type: :string, enum: Family::MONIKERS },
              default_account_sharing: { type: :string, enum: %w[shared private] },
              custom_enabled_currencies: { type: :boolean },
              enabled_currencies: {
                type: :array,
                items: { type: :string }
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          BudgetSummary: {
            type: :object,
            required: %w[id start_date end_date name currency initialized current created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              start_date: { type: :string, format: :date },
              end_date: { type: :string, format: :date },
              name: { type: :string },
              currency: { type: :string },
              initialized: { type: :boolean },
              current: { type: :boolean },
              budgeted_spending: { type: :string, nullable: true },
              budgeted_spending_cents: { type: :integer, nullable: true },
              expected_income: { type: :string, nullable: true },
              expected_income_cents: { type: :integer, nullable: true },
              allocated_spending: { type: :string },
              allocated_spending_cents: { type: :integer },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          Budget: {
            type: :object,
            required: %w[id start_date end_date name currency initialized current created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              start_date: { type: :string, format: :date },
              end_date: { type: :string, format: :date },
              name: { type: :string },
              currency: { type: :string },
              initialized: { type: :boolean },
              current: { type: :boolean },
              budgeted_spending: { type: :string, nullable: true },
              budgeted_spending_cents: { type: :integer, nullable: true },
              expected_income: { type: :string, nullable: true },
              expected_income_cents: { type: :integer, nullable: true },
              allocated_spending: { type: :string },
              allocated_spending_cents: { type: :integer },
              actual_spending: { type: :string },
              actual_spending_cents: { type: :integer },
              actual_income: { type: :string },
              actual_income_cents: { type: :integer },
              available_to_spend: { type: :string },
              available_to_spend_cents: { type: :integer },
              available_to_allocate: { type: :string },
              available_to_allocate_cents: { type: :integer },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          BudgetCollection: {
            type: :object,
            required: %w[budgets pagination],
            properties: {
              budgets: {
                type: :array,
                items: { '$ref' => '#/components/schemas/BudgetSummary' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          BudgetCategorySummary: {
            type: :object,
            required: %w[id budget_id currency subcategory inherits_parent_budget rollover_enabled category created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              budget_id: { type: :string, format: :uuid },
              currency: { type: :string },
              subcategory: { type: :boolean },
              inherits_parent_budget: { type: :boolean },
              rollover_enabled: { type: :boolean },
              budgeted_spending: { type: :string },
              budgeted_spending_cents: { type: :integer },
              display_budgeted_spending: { type: :string },
              display_budgeted_spending_cents: { type: :integer },
              category: {
                type: :object,
                required: %w[id name color lucide_icon],
                properties: {
                  id: { type: :string, format: :uuid },
                  name: { type: :string },
                  color: { type: :string },
                  lucide_icon: { type: :string },
                  parent_id: { type: :string, format: :uuid, nullable: true }
                }
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          BudgetCategory: {
            type: :object,
            required: %w[id budget_id currency subcategory inherits_parent_budget rollover_enabled category created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              budget_id: { type: :string, format: :uuid },
              currency: { type: :string },
              subcategory: { type: :boolean },
              inherits_parent_budget: { type: :boolean },
              rollover_enabled: { type: :boolean },
              budgeted_spending: { type: :string },
              budgeted_spending_cents: { type: :integer },
              display_budgeted_spending: { type: :string },
              display_budgeted_spending_cents: { type: :integer },
              actual_spending: { type: :string },
              actual_spending_cents: { type: :integer },
              rolled_over_amount: { type: :string },
              rolled_over_amount_cents: { type: :integer },
              available_to_spend: { type: :string },
              available_to_spend_cents: { type: :integer },
              category: {
                type: :object,
                required: %w[id name color lucide_icon],
                properties: {
                  id: { type: :string, format: :uuid },
                  name: { type: :string },
                  color: { type: :string },
                  lucide_icon: { type: :string },
                  parent_id: { type: :string, format: :uuid, nullable: true }
                }
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          BudgetCategoryCollection: {
            type: :object,
            required: %w[budget_categories pagination],
            properties: {
              budget_categories: {
                type: :array,
                items: { '$ref' => '#/components/schemas/BudgetCategorySummary' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          Balance: {
            type: :object,
            required: %w[id date currency flows_factor balance balance_cents start_balance start_balance_cents end_balance end_balance_cents account created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              date: { type: :string, format: :date },
              currency: { type: :string },
              flows_factor: { type: :number, format: :float },
              balance: { type: :string },
              balance_cents: { type: :integer, description: 'Balance in currency minor units' },
              cash_balance: { type: :string, nullable: true },
              cash_balance_cents: { type: :integer, nullable: true, description: 'Cash balance in currency minor units' },
              start_cash_balance: { type: :string },
              start_cash_balance_cents: { type: :integer, description: 'Starting cash balance in currency minor units' },
              start_non_cash_balance: { type: :string },
              start_non_cash_balance_cents: { type: :integer, description: 'Starting non-cash balance in currency minor units' },
              start_balance: { type: :string },
              start_balance_cents: { type: :integer, description: 'Starting total balance in currency minor units' },
              cash_inflows: { type: :string },
              cash_inflows_cents: { type: :integer, description: 'Cash inflows in currency minor units' },
              cash_outflows: { type: :string },
              cash_outflows_cents: { type: :integer, description: 'Cash outflows in currency minor units' },
              non_cash_inflows: { type: :string },
              non_cash_inflows_cents: { type: :integer, description: 'Non-cash inflows in currency minor units' },
              non_cash_outflows: { type: :string },
              non_cash_outflows_cents: { type: :integer, description: 'Non-cash outflows in currency minor units' },
              net_market_flows: { type: :string },
              net_market_flows_cents: { type: :integer, description: 'Net market flows in currency minor units' },
              cash_adjustments: { type: :string },
              cash_adjustments_cents: { type: :integer, description: 'Cash adjustments in currency minor units' },
              non_cash_adjustments: { type: :string },
              non_cash_adjustments_cents: { type: :integer, description: 'Non-cash adjustments in currency minor units' },
              end_cash_balance: { type: :string },
              end_cash_balance_cents: { type: :integer, description: 'Ending cash balance in currency minor units' },
              end_non_cash_balance: { type: :string },
              end_non_cash_balance_cents: { type: :integer, description: 'Ending non-cash balance in currency minor units' },
              end_balance: { type: :string },
              end_balance_cents: { type: :integer, description: 'Ending total balance in currency minor units' },
              account: { '$ref' => '#/components/schemas/BalanceAccount' },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          BalanceAccount: {
            type: :object,
            required: %w[id name account_type],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              account_type: { type: :string, nullable: true }
            }
          },
          BalanceCollection: {
            type: :object,
            required: %w[balances pagination],
            properties: {
              balances: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Balance' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          Category: {
            type: :object,
            required: %w[id name color icon],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              color: { type: :string },
              icon: { type: :string }
            }
          },
          CategoryParent: {
            type: :object,
            required: %w[id name],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string }
            }
          },
          CategoryDetail: {
            type: :object,
            required: %w[id name color icon subcategories_count created_at updated_at],
            properties: {
              workspace: { '$ref' => '#/components/schemas/CategoryWorkspaceRow' },
              id: { type: :string, format: :uuid },
              name: { type: :string },
              color: { type: :string },
              icon: { type: :string },
              parent: { '$ref' => '#/components/schemas/CategoryParent', nullable: true },
              subcategories_count: { type: :integer, minimum: 0 },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          CategoryCollection: {
            type: :object,
            required: %w[categories pagination],
            properties: {
              workspace: { '$ref' => '#/components/schemas/CategoryWorkspace' },
              categories: {
                type: :array,
                items: { '$ref' => '#/components/schemas/CategoryDetail' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          CategoryCreateRequest: {
            type: :object,
            required: %w[category],
            properties: {
              transaction_id: { type: :string, format: :uuid, description: 'Optionally assign the new category to an annotatable transaction atomically.' },
              category: {
                type: :object,
                required: %w[name],
                properties: {
                  name: { type: :string, description: 'Category name (required, unique within family)' },
                  color: { type: :string, description: 'Hex color code (e.g. #22c55e). Defaults to #6172F3 if omitted; subcategories inherit parent color.' },
                  icon: { type: :string, description: 'Lucide icon name (e.g. "coffee"). Auto-suggested from the name when omitted.' },
                  parent_id: { type: :string, format: :uuid, nullable: true, description: 'Parent category ID. Must belong to the same family. Categories support up to 2 levels of nesting.' }
                }
              }
            }
          },
          CategoryUpdateRequest: {
            type: :object,
            required: %w[category],
            properties: {
              category: {
                type: :object,
                properties: {
                  name: { type: :string, minLength: 1 },
                  parent_id: { type: :string, format: :uuid, nullable: true },
                  color: { type: :string, pattern: '^#[0-9A-Fa-f]{6}$', description: 'Six-digit hex color. Subcategory updates inherit the parent color.' },
                  icon: { type: :string, minLength: 1, description: 'Lucide icon name (e.g. "building"). Cannot be blank.' }
                },
                description: 'Supply name, parent_id, color, or icon. Omitted fields are preserved; hierarchy supports two levels and must remain within the family.'
              }
            }
          },
          Merchant: {
            type: :object,
            required: %w[id name],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              website_url: { type: :string, nullable: true },
              logo_url: { type: :string, nullable: true }
            }
          },
          MerchantDetail: {
            type: :object,
            required: %w[id name type created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              type: { type: :string, enum: %w[FamilyMerchant ProviderMerchant] },
              color: { type: :string, nullable: true, description: 'Hex color used for the fallback avatar' },
              website_url: { type: :string, nullable: true },
              logo_url: { type: :string, nullable: true, description: 'Direct merchant logo URL' },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          MerchantRequest: {
            type: :object,
            required: %w[merchant],
            properties: {
              merchant: {
                type: :object,
                properties: {
                  name: { type: :string, description: 'Merchant name. Required when creating a merchant.' },
                  color: { type: :string, description: 'Hex color used for the fallback avatar' },
                  website_url: { type: :string, nullable: true },
                  logo_url: { type: :string, nullable: true, description: 'Direct merchant logo URL' }
                }
              }
            }
          },
          MerchantImportResult: {
            type: :object,
            required: %w[imported skipped merchants],
            properties: {
              imported: { type: :integer, description: 'Number of merchants successfully created' },
              skipped: { type: :integer, description: 'Number of rows skipped (duplicates or invalid)' },
              merchants: { type: :array, items: { '$ref' => '#/components/schemas/MerchantDetail' } }
            }
          },
          Tag: {
            type: :object,
            required: %w[id name color],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              color: { type: :string }
            }
          },
          TagDetail: {
            type: :object,
            required: %w[id name color created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              color: { type: :string },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          TagCollection: {
            type: :array,
            items: { '$ref' => '#/components/schemas/TagDetail' }
          },
          GlobalSearchHit: {
            type: :object,
            required: %w[id type title subtitle url],
            properties: {
              id: { type: :string, format: :uuid },
              type: { type: :string, enum: %w[account transaction category merchant] },
              title: { type: :string },
              subtitle: { type: :string },
              url: { type: :string }
            }
          },
          GlobalSearchResults: {
            type: :object,
            required: %w[query results],
            properties: {
              query: { type: :string },
              results: {
                type: :object,
                required: %w[accounts transactions categories merchants],
                properties: {
                  accounts: { type: :array, items: { '$ref' => '#/components/schemas/GlobalSearchHit' } },
                  transactions: { type: :array, items: { '$ref' => '#/components/schemas/GlobalSearchHit' } },
                  categories: { type: :array, items: { '$ref' => '#/components/schemas/GlobalSearchHit' } },
                  merchants: { type: :array, items: { '$ref' => '#/components/schemas/GlobalSearchHit' } }
                }
              }
            }
          },
          RuleAction: {
            type: :object,
            required: %w[id action_type created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              action_type: { type: :string },
              value: { type: :string, nullable: true },
              values: { type: :array, items: { type: :string } },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          RuleCondition: {
            type: :object,
            required: %w[id condition_type operator sub_conditions created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              condition_type: { type: :string },
              operator: { type: :string },
              value: { type: :string, nullable: true },
              sub_conditions: {
                type: :array,
                items: { '$ref' => '#/components/schemas/RuleCondition' }
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          Rule: {
            type: :object,
            required: %w[id resource_type active conditions actions created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string, nullable: true },
              resource_type: { type: :string, enum: %w[transaction] },
              active: { type: :boolean },
              effective_date: { type: :string, format: :date, nullable: true },
              conditions: {
                type: :array,
                items: { '$ref' => '#/components/schemas/RuleCondition' }
              },
              actions: {
                type: :array,
                items: { '$ref' => '#/components/schemas/RuleAction' }
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          RuleResponse: {
            type: :object,
            required: %w[data],
            properties: {
              data: { '$ref' => '#/components/schemas/Rule' },
              confirm: { '$ref' => '#/components/schemas/RulePreview' }
            }
          },
          RuleCollection: {
            type: :object,
            required: %w[data meta],
            properties: {
              workspace: { '$ref' => '#/components/schemas/RulesWorkspace' },
              data: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Rule' }
              },
              meta: {
                type: :object,
                required: %w[current_page total_pages total_count per_page],
                properties: {
                  current_page: { type: :integer },
                  next_page: { type: :integer, nullable: true },
                  prev_page: { type: :integer, nullable: true },
                  total_pages: { type: :integer },
                  total_count: { type: :integer },
                  per_page: { type: :integer }
                }
              }
            }
          },
          RuleRun: {
            type: :object,
            required: %w[id rule_id rule_name execution_type status transactions_queued transactions_processed transactions_modified pending_jobs_count executed_at rule created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              rule_id: { type: :string, format: :uuid },
              rule_name: { type: :string, nullable: true },
              execution_type: { type: :string, enum: %w[manual scheduled] },
              status: { type: :string, enum: %w[pending success failed] },
              transactions_queued: { type: :integer, minimum: 0 },
              transactions_processed: { type: :integer, minimum: 0 },
              transactions_modified: { type: :integer, minimum: 0 },
              pending_jobs_count: { type: :integer, minimum: 0 },
              executed_at: { type: :string, format: :'date-time' },
              error_message: { type: :string, nullable: true },
              rule: {
                type: :object,
                nullable: true,
                required: %w[id resource_type active],
                properties: {
                  id: { type: :string, format: :uuid },
                  name: { type: :string, nullable: true },
                  resource_type: { type: :string },
                  active: { type: :boolean }
                }
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          RuleRunResponse: {
            type: :object,
            required: %w[data],
            properties: {
              data: { '$ref' => '#/components/schemas/RuleRun' }
            }
          },
          RuleRunCollection: {
            type: :object,
            required: %w[data meta],
            properties: {
              data: {
                type: :array,
                items: { '$ref' => '#/components/schemas/RuleRun' }
              },
              meta: {
                type: :object,
                required: %w[current_page total_pages total_count per_page],
                properties: {
                  current_page: { type: :integer },
                  next_page: { type: :integer, nullable: true },
                  prev_page: { type: :integer, nullable: true },
                  total_pages: { type: :integer },
                  total_count: { type: :integer },
                  per_page: { type: :integer }
                }
              }
            }
          },
          Transfer: {
            type: :object,
            required: %w[id amount currency status permissions],
            properties: {
              id: { type: :string, format: :uuid },
              amount: { type: :string },
              currency: { type: :string },
              status: { type: :string, enum: %w[pending confirmed], description: 'Match status. pending transfers can be confirmed or rejected.' },
              permissions: { '$ref' => '#/components/schemas/TransferPermissions' },
              other_account: { '$ref' => '#/components/schemas/Account', nullable: true }
            }
          },
          TransferMatchCandidateSide: {
            type: :object,
            required: %w[id name date amount signed_amount_cents currency account],
            properties: {
              id: { type: :string, format: :uuid, description: 'Transaction ID' },
              name: { type: :string },
              date: { type: :string, format: :date },
              amount: { type: :string, description: 'Absolute amount, formatted' },
              signed_amount_cents: { type: :integer, description: 'Signed amount in currency minor units (negative = inflow)' },
              currency: { type: :string },
              account: {
                type: :object,
                required: %w[id name],
                properties: {
                  id: { type: :string, format: :uuid },
                  name: { type: :string }
                }
              }
            }
          },
          TransferMatchCandidate: {
            type: :object,
            required: %w[inflow_transaction_id outflow_transaction_id date_diff inflow_transaction outflow_transaction],
            properties: {
              inflow_transaction_id: { type: :string, format: :uuid },
              outflow_transaction_id: { type: :string, format: :uuid },
              date_diff: { type: :integer, minimum: 0, description: 'Days between the two entries' },
              inflow_transaction: { '$ref' => '#/components/schemas/TransferMatchCandidateSide' },
              outflow_transaction: { '$ref' => '#/components/schemas/TransferMatchCandidateSide' }
            }
          },
          TransferMatchCandidateCollection: {
            type: :object,
            required: %w[candidates],
            properties: {
              candidates: {
                type: :array,
                items: { '$ref' => '#/components/schemas/TransferMatchCandidate' }
              }
            }
          },
          RecurringTransaction: {
            type: :object,
            required: %w[id amount amount_cents currency expected_day_of_month last_occurrence_date next_expected_date status occurrence_count manual created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              amount: { type: :string, description: 'Formatted series amount. With upcoming=true, managed credit-card rows instead return the current occurrence unpaid remainder.' },
              amount_cents: { type: :integer, description: 'Amount in currency minor units; with upcoming=true, the unpaid remainder for managed credit-card rows.' },
              currency: { type: :string },
              expected_day_of_month: { type: :integer, minimum: 1, maximum: 31, nullable: true, description: 'Null when a managed credit-card payment day cannot be inferred.' },
              last_occurrence_date: { type: :string, format: :date },
              next_expected_date: { type: :string, format: :date, nullable: true, description: 'Null when a managed credit-card payment day is unknown.' },
              status: { type: :string, enum: %w[suggested active paused inactive ended] },
              occurrence_count: { type: :integer, minimum: 0 },
              name: { type: :string, nullable: true },
              manual: { type: :boolean },
              system_managed_kind: { type: :string, nullable: true, enum: [ 'credit_card_payment' ], readOnly: true, description: 'Automatic credit-card series cannot be edited, paused, or deleted. Configure the account payment_due_day instead. Series amount is zero except in upcoming=true projections; current_occurrence carries the closed-cycle estimate.' },
              current_occurrence: {
                type: :object, nullable: true, readOnly: true, description: 'Credit-card estimate available from its estimated statement closing date.',
                properties: {
                  id: { type: :string, format: :uuid },
                  due_on: { type: :string, format: :date },
                  currency: { type: :string, description: 'Currency of this occurrence and its monetary amounts.' },
                  due_date_source: { type: :string, enum: %w[manual estimated] },
                  statement_start_on: { type: :string, format: :date },
                  statement_end_on: { type: :string, format: :date },
                  statement_balance: { type: :string, description: 'Estimated closing debt, in major currency units.' },
                  post_statement_credits: { type: :string, description: 'Credits posted since this statement close, in major currency units. Overlapping periods may report the same credits; outstanding amounts do not double-count them.' },
                  expected_amount: { type: :string, description: 'Estimated obligation, in major currency units.' },
                  remaining_amount: { type: :string, description: 'Estimated unpaid amount, in major currency units.' },
                  status: { type: :string, enum: %w[scheduled paid skipped missed] }
                }
              },
              payment_url: { type: :string, nullable: true, description: 'Link to the biller portal where this bill is paid. Only http and https are accepted; a bare host is stored as https.' },
              autopay: { type: :boolean, description: 'Whether this bill pays itself automatically.' },
              notes: { type: :string, nullable: true, description: 'Free-text notes shown alongside the bill.' },
              bill_type: { type: :string, enum: %w[bill subscription installment income transfer other], description: 'What kind of obligation this is.' },
              category_id: { type: :string, format: :uuid, nullable: true },
              anchor_date: { type: :string, format: :date, nullable: true, description: 'Reference occurrence that phases every-N cadences.' },
              weekend_adjust: { type: :string, enum: %w[none skip before after] },
              end_mode: { type: :string, enum: %w[never on_date after_count] },
              end_on: { type: :string, format: :date, nullable: true },
              end_after_count: { type: :integer, nullable: true },
              renews_on: { type: :string, format: :date, nullable: true },
              trial_ends_on: { type: :string, format: :date, nullable: true },
              cancelled_on: { type: :string, format: :date, nullable: true },
              recurrence_rules: {
                type: :array,
                description: 'Repetition patterns; multiple rows express semimonthly and similar multi-pattern cadences. Empty means legacy monthly on expected_day_of_month.',
                items: {
                  type: :object,
                  properties: {
                    frequency: { type: :string, enum: %w[weekly monthly yearly] },
                    interval: { type: :integer },
                    day_of_month: { type: :integer, nullable: true, description: '-1 means the last day of the month.' },
                    weekday: { type: :integer, nullable: true },
                    weekday_ordinal: { type: :integer, nullable: true, description: '-1 means the last such weekday.' },
                    month_of_year: { type: :integer, nullable: true }
                  }
                }
              },
              expected_amount_min: { type: :string, nullable: true },
              expected_amount_min_cents: { type: :integer, nullable: true, description: 'Minimum expected amount in currency minor units' },
              expected_amount_max: { type: :string, nullable: true },
              expected_amount_max_cents: { type: :integer, nullable: true, description: 'Maximum expected amount in currency minor units' },
              expected_amount_avg: { type: :string, nullable: true },
              expected_amount_avg_cents: { type: :integer, nullable: true, description: 'Average expected amount in currency minor units' },
              account: { '$ref' => '#/components/schemas/Account', nullable: true },
              merchant: { '$ref' => '#/components/schemas/Merchant', nullable: true },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          RecurringTransactionCollection: {
            type: :object,
            required: %w[recurring_transactions pagination],
            properties: {
              recurring_transactions: {
                type: :array,
                items: { '$ref' => '#/components/schemas/RecurringTransaction' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          Transaction: {
            type: :object,
            required: %w[id entry_id date amount amount_cents signed_amount_cents currency name classification detail_path pending excluded account permissions tags created_at updated_at category_editable category_set_on_transfer_outflow display_category],
            properties: {
              id: { type: :string, format: :uuid },
              entry_id: { type: :string, format: :uuid },
              parent_entry_id: { type: :string, format: :uuid, nullable: true, description: 'Parent entry id for split children; null otherwise.' },
              date: { type: :string, format: :date },
              amount: { type: :string },
              amount_cents: { type: :integer, minimum: 0 },
              signed_amount_cents: { type: :integer },
              currency: { type: :string },
              name: { type: :string },
              logo_url: { type: :string, nullable: true, description: 'Display logo URL: investment activity security first, otherwise merchant. Brandfetch URLs use the current logo resolution setting.' },
              notes: { type: :string, nullable: true },
              external_id: { type: :string, nullable: true },
              source: { type: :string, nullable: true },
              user_modified: { type: :boolean },
              detail_path: { type: :string, description: 'Web app URL for the transaction detail page, present in list responses.' },
              classification: { type: :string },
              kind: { type: :string, enum: %w[standard funds_movement cc_payment loan_payment one_time investment_contribution], description: 'Transaction kind for budget classification.' },
              pending: { type: :boolean, description: 'Whether the transaction is still pending at a provider (present in list responses).' },
              excluded: { type: :boolean, description: 'Whether the transaction is excluded from reports (present in list responses).' },
              splittable: { type: :boolean, description: 'Detail-only structural eligibility for splitting. Account permissions.can_edit is separately required.' },
              split_annotation_support: { type: :boolean, enum: [ true ], description: 'Detail-only capability for atomic parent/child notes and tags on split create/update; not a permission grant.' },
              recurring_exists: { type: :boolean, description: 'Whether a manual recurring transaction already exists for this pattern (present in detail responses).' },
              account: { '$ref' => '#/components/schemas/Account' },
              permissions: { '$ref' => '#/components/schemas/AccountPermissions' },
              category: { '$ref' => '#/components/schemas/Category', nullable: true },
              category_editable: { type: :boolean, description: 'Whether this leg owns an editable category. Unmatched transactions remain editable; account annotation permission is also required.' },
              category_set_on_transfer_outflow: { type: :boolean, description: 'Whether the category belongs to the outgoing leg of this matched transfer.' },
              display_category: {
                type: :object, nullable: true, required: %w[name color icon],
                description: 'Category badge to display, including Payment/Transfer virtual badges or the accessible outgoing leg category. Does not expose categories from inaccessible accounts.',
                properties: {
                  name: { type: :string },
                  color: { type: :string },
                  icon: { type: :string }
                }
              },
              merchant: { '$ref' => '#/components/schemas/Merchant', nullable: true },
              tags: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Tag' }
              },
              transfer: { '$ref' => '#/components/schemas/Transfer', nullable: true },
              split_children: {
                type: :array,
                items: { '$ref' => '#/components/schemas/SplitChild' },
                description: 'Split child entries (present in detail responses when the entry is a split parent).'
              },
              split_parent: { '$ref' => '#/components/schemas/SplitParentDetail', nullable: true },
              investment_activity_label: { type: :string, nullable: true, description: 'Investment activity label for transactions in investment/crypto accounts.' },
              protected_from_sync: { type: :boolean, description: 'Whether the entry is protected from provider sync overwrites (present in detail responses).' },
              bill_allocations: {
                type: :array,
                items: { '$ref' => '#/components/schemas/BillAllocation' },
                description: 'Bills this transaction was applied to (preview-gated; empty without the flag).'
              },
              potential_duplicate: { '$ref' => '#/components/schemas/PotentialDuplicate', nullable: true },
              attachments: {
                type: :array,
                items: { '$ref' => '#/components/schemas/TransactionAttachment' },
                description: 'File attachments (present in detail responses).'
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          TransactionAttachment: {
            type: :object,
            required: %w[id filename byte_size content_type created_at],
            properties: {
              id: { type: :integer },
              filename: { type: :string },
              byte_size: { type: :integer },
              content_type: { type: :string, nullable: true },
              created_at: { type: :string, format: :'date-time' },
              url: { type: :string, description: 'Authorized attachment navigation endpoint; follows a redirect to the binary file.' }
            }
          },
          PotentialDuplicate: {
            type: :object,
            required: %w[entry_id name date account_name amount],
            properties: {
              entry_id: { type: :string, format: :uuid },
              name: { type: :string },
              date: { type: :string, format: :date },
              account_name: { type: :string },
              amount: { type: :string }
            }
          },
          BillAllocation: {
            type: :object,
            required: %w[allocation_id bill_name amount due_on unreviewed],
            properties: {
              allocation_id: { type: :string, format: :uuid },
              bill_name: { type: :string },
              amount: { type: :string },
              due_on: { type: :string, format: :date },
              unreviewed: { type: :boolean }
            }
          },
          SplitChild: {
            type: :object,
            required: %w[entry_id transaction_id name amount notes tags],
            properties: {
              entry_id: { type: :string, format: :uuid },
              transaction_id: { type: :string, format: :uuid, description: 'Child transaction ID for fetching its complete, non-localized transaction details.' },
              name: { type: :string },
              amount: { type: :string },
              notes: { type: :string, nullable: true, description: 'Child notes. Preserve string values when replacing a split; omit null notes from the request.' },
              tags: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Tag' },
                description: 'Tags belonging only to this child. Resubmit their IDs when replacing a split to preserve them.'
              },
              category_id: { type: :string, format: :uuid, nullable: true },
              category_name: { type: :string, nullable: true },
              transfer_account_id: {
                type: :string, format: :uuid, nullable: true,
                description: 'Counterpart account for a linked transfer, in either direction; null for non-transfer splits. Preserve this value when editing a split.'
              }
            }
          },
          SplitParentDetail: {
            type: :object,
            required: %w[entry_id transaction_id name date amount],
            properties: {
              entry_id: { type: :string, format: :uuid },
              transaction_id: { type: :string, format: :uuid },
              name: { type: :string },
              date: { type: :string, format: :date },
              amount: { type: :string }
            }
          },
          TransactionCollection: {
            type: :object,
            required: %w[transactions pagination],
            properties: {
              transactions: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Transaction' }
              },
              split_parents: {
                type: :array,
                items: { '$ref' => '#/components/schemas/SplitParent' },
                description: 'Split parent entries for grouped headers; children carry parent_entry_id.'
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          SplitParent: {
            type: :object,
            required: %w[entry_id transaction_id name amount account_name],
            properties: {
              entry_id: { type: :string, format: :uuid },
              transaction_id: { type: :string, format: :uuid },
              name: { type: :string },
              amount: { type: :string },
              account_name: { type: :string },
              merchant: {
                type: :object,
                required: %w[id name],
                nullable: true,
                description: "Parent merchant, inherited by split children; null when unassigned.",
                properties: {
                  id: { type: :string, format: :uuid },
                  name: { type: :string },
                  logo_url: { type: :string, nullable: true }
                }
              }
            }
          },
          SplitAnnotations: {
            type: :object,
            description: 'Optional parent annotations applied atomically with split creation/replacement. Omitted fields are unchanged; an empty tag_ids array clears tags. No parent financial or category changes are accepted.',
            properties: {
              notes: { type: :string },
              tag_ids: {
                type: :array,
                items: { type: :string, format: :uuid },
                description: 'Replacement tag IDs; every tag must belong to the current family.'
              }
            }
          },
          TransactionSplitRequest: {
            type: :object,
            required: %w[split],
            properties: {
              split: {
                type: :object,
                required: %w[splits],
                properties: {
                  parent: { '$ref' => '#/components/schemas/SplitAnnotations' },
                  splits: {
                    type: :array,
                    minItems: 1,
                    items: {
                      type: :object,
                      required: %w[name amount],
                      properties: {
                        name: { type: :string },
                        amount: {
                          oneOf: [ { type: :number }, { type: :string, pattern: '^-?[0-9]+(\.[0-9]+)?$' } ],
                          description: 'Cash-flow amount in major units (exact decimal strings supported): expenses/outflows are negative and income/inflows positive. Values must sum to the parent cash-flow amount.'
                        },
                        category_id: { type: :string, format: :uuid, nullable: true },
                        notes: { type: :string, description: 'Notes for this child. Existing transfer counterpart note inheritance is unchanged.' },
                        tag_ids: {
                          type: :array,
                          items: { type: :string, format: :uuid },
                          description: 'Replacement tags for this child only, never the parent, siblings or transfer counterpart. Every tag must belong to the current family. An empty array clears tags; resubmit existing child tag IDs when replacing a split to preserve them.'
                        },
                        excluded: { type: :boolean },
                        transfer_account_id: { type: :string, format: :uuid, nullable: true, description: 'Optional destination/source account for this split leg. When present, a Transfer counterpart is created in the given account.' }
                      }
                    }
                  }
                }
              }
            }
          },
          TransactionSplit: {
            type: :object,
            required: %w[parent_transaction_id splits],
            properties: {
              parent_transaction_id: { type: :string, format: :uuid },
              splits: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Transaction' }
              }
            }
          },
          TransferTransactionSide: {
            type: :object,
            required: %w[id entry_id date amount amount_cents currency name kind account],
            properties: {
              id: { type: :string, format: :uuid },
              entry_id: { type: :string, format: :uuid },
              date: { type: :string, format: :date },
              amount: { type: :string },
              amount_cents: { type: :integer, description: 'Signed amount in currency minor units' },
              currency: { type: :string },
              name: { type: :string },
              kind: { type: :string },
              account: {
                type: :object,
                required: %w[id name account_type],
                properties: {
                  id: { type: :string, format: :uuid },
                  name: { type: :string },
                  account_type: { type: :string, nullable: true },
                  logo_url: { type: :string, nullable: true },
                  color: { type: :string, nullable: true }
                }
              }
            }
          },
          TransferDecision: {
            type: :object,
            required: %w[id status date amount amount_cents currency transfer_type permissions inflow_transaction outflow_transaction created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              status: { type: :string, enum: %w[pending confirmed] },
              date: { type: :string, format: :date },
              amount: { type: :string },
              amount_cents: { type: :integer, description: 'Absolute transfer amount in currency minor units' },
              currency: { type: :string },
              transfer_type: { type: :string, enum: %w[transfer liability_payment loan_payment] },
              notes: { type: :string, nullable: true },
              name: { type: :string, nullable: true },
              payment: { type: :boolean, nullable: true },
              categorizable: { type: :boolean, nullable: true },
              permissions: { '$ref' => '#/components/schemas/TransferPermissions' },
              category: { '$ref' => '#/components/schemas/Category', nullable: true },
              tags: { type: :array, items: { '$ref' => '#/components/schemas/Tag' } },
              can_mark_as_recurring: { type: :boolean, nullable: true, description: 'Requires ownership or full_control of both endpoint accounts and enabled recurring features.' },
              recurring_exists: { type: :boolean, nullable: true },
              source_fee_amount: { type: :string, nullable: true, description: 'Fee charged to the source account' },
              source_fee_currency: { type: :string, nullable: true },
              destination_fee_amount: { type: :string, nullable: true, description: 'Separate fee expense in the destination account; does not reduce the transfer principal.' },
              destination_fee_currency: { type: :string, nullable: true },
              inflow_transaction: { '$ref' => '#/components/schemas/TransferTransactionSide' },
              outflow_transaction: { '$ref' => '#/components/schemas/TransferTransactionSide' },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          TransferDecisionCollection: {
            type: :object,
            required: %w[transfers pagination],
            properties: {
              transfers: {
                type: :array,
                items: { '$ref' => '#/components/schemas/TransferDecision' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          RejectedTransfer: {
            type: :object,
            required: %w[id inflow_transaction outflow_transaction created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              inflow_transaction: { '$ref' => '#/components/schemas/TransferTransactionSide' },
              outflow_transaction: { '$ref' => '#/components/schemas/TransferTransactionSide' },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          RejectedTransferCollection: {
            type: :object,
            required: %w[rejected_transfers pagination],
            properties: {
              rejected_transfers: {
                type: :array,
                items: { '$ref' => '#/components/schemas/RejectedTransfer' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          Valuation: {
            type: :object,
            required: %w[id date amount currency kind account created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              date: { type: :string, format: :date },
              amount: { type: :string },
              currency: { type: :string },
              notes: { type: :string, nullable: true },
              kind: { type: :string },
              account: { '$ref' => '#/components/schemas/Account' },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          ValuationCollection: {
            type: :object,
            required: %w[valuations pagination],
            properties: {
              valuations: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Valuation' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          DeleteResponse: {
            type: :object,
            required: %w[message],
            properties: {
              message: { type: :string }
            }
          },
          TransactionResponse: {
            type: :object,
            required: %w[id date amount currency name entryable_type account],
            properties: {
              id: { type: :string, format: :uuid },
              date: { type: :string, format: :date },
              amount: { type: :string },
              currency: { type: :string },
              name: { type: :string },
              entryable_type: { type: :string },
              account: {
                type: :object,
                required: %w[id name account_type],
                properties: {
                  id: { type: :string, format: :uuid },
                  name: { type: :string },
                  account_type: { type: :string, nullable: true }
                }
              }
            }
          },
          ImportConfiguration: {
            type: :object,
            properties: {
              date_col_label: { type: :string, nullable: true },
              amount_col_label: { type: :string, nullable: true },
              name_col_label: { type: :string, nullable: true },
              category_col_label: { type: :string, nullable: true },
              tags_col_label: { type: :string, nullable: true },
              notes_col_label: { type: :string, nullable: true },
              account_col_label: { type: :string, nullable: true },
              date_format: { type: :string, nullable: true },
              number_format: { type: :string, nullable: true },
              signage_convention: { type: :string, nullable: true }
            }
          },
          ImportStats: {
            type: :object,
            required: %w[rows_count valid_rows_count invalid_rows_count mappings_count unassigned_mappings_count],
            properties: {
              rows_count: { type: :integer, minimum: 0 },
              valid_rows_count: { type: :integer, minimum: 0 },
              invalid_rows_count: { type: :integer, minimum: 0 },
              mappings_count: { type: :integer, minimum: 0 },
              unassigned_mappings_count: { type: :integer, minimum: 0 }
            }
          },
          ImportVerificationReadback: {
            type: :object,
            description: 'SureImport only. Expected NDJSON counts compared to family-scoped database readback after publish.',
            properties: {
              status: { type: :string, enum: %w[not_verified matched mismatch failed reverted] },
              checked_at: { type: :string, format: :'date-time', nullable: true },
              expected_record_counts: {
                type: :object,
                additionalProperties: { type: :integer }
              },
              before_counts: {
                type: :object,
                additionalProperties: { type: :integer }
              },
              after_counts: {
                type: :object,
                additionalProperties: { type: :integer }
              },
              actual_delta_counts: {
                type: :object,
                additionalProperties: { type: :integer }
              },
              checked_counts: {
                type: :object,
                additionalProperties: { type: :integer }
              },
              mismatches: {
                type: :object,
                additionalProperties: {
                  type: :object,
                  required: %w[expected actual],
                  properties: {
                    expected: { type: :integer },
                    actual: { type: :integer }
                  }
                }
              },
              error: { type: :string, nullable: true }
            }
          },
          ImportVerification: {
            type: :object,
            description: 'SureImport only. Captured at upload and completed after import publish.',
            required: %w[expected_record_counts readback],
            properties: {
              expected_record_counts: {
                type: :object,
                additionalProperties: { type: :integer }
              },
              readback: { '$ref' => '#/components/schemas/ImportVerificationReadback' }
            }
          },
          ImportPreflightContent: {
            type: :object,
            required: %w[filename content_type byte_size],
            properties: {
              filename: { type: :string },
              content_type: { type: :string },
              byte_size: { type: :integer, minimum: 0 }
            }
          },
          ImportPreflightError: {
            type: :object,
            required: %w[code message],
            properties: {
              code: { type: :string },
              message: { type: :string }
            }
          },
          ImportPreflightStats: {
            type: :object,
            required: %w[rows_count],
            properties: {
              rows_count: {
                type: :integer,
                minimum: 0,
                description: 'CSV parsed non-header rows, or nonblank Sure NDJSON lines.'
              },
              valid_rows_count: {
                type: :integer,
                minimum: 0,
                description: 'SureImport only. Valid NDJSON records.'
              },
              invalid_rows_count: {
                type: :integer,
                minimum: 0,
                description: 'SureImport only. Invalid NDJSON records. CSV malformed content returns a 422 instead.'
              },
              entity_counts: {
                type: :object,
                additionalProperties: { type: :integer },
                nullable: true
              },
              record_type_counts: {
                type: :object,
                additionalProperties: { type: :integer },
                nullable: true
              }
            }
          },
          ImportPreflight: {
            type: :object,
            required: %w[type valid content stats errors warnings],
            properties: {
              type: { type: :string, enum: Import::TYPES },
              valid: { type: :boolean },
              content: { '$ref' => '#/components/schemas/ImportPreflightContent' },
              stats: { '$ref' => '#/components/schemas/ImportPreflightStats' },
              headers: {
                type: :array,
                items: { type: :string },
                nullable: true
              },
              required_headers: {
                type: :array,
                items: { type: :string },
                nullable: true
              },
              missing_required_headers: {
                type: :array,
                items: { type: :string },
                nullable: true
              },
              errors: {
                type: :array,
                items: { '$ref' => '#/components/schemas/ImportPreflightError' }
              },
              warnings: {
                type: :array,
                items: { type: :string }
              }
            }
          },
          ImportPreflightResponse: {
            type: :object,
            required: %w[data],
            properties: {
              data: { '$ref' => '#/components/schemas/ImportPreflight' }
            }
          },
          ImportStatusSummary: {
            type: :object,
            required: %w[uploaded configured terminal],
            properties: {
              uploaded: { type: :boolean },
              configured: { type: :boolean },
              terminal: { type: :boolean }
            }
          },
          ImportStatusDetail: {
            allOf: [
              { '$ref' => '#/components/schemas/ImportStatusSummary' },
              {
                type: :object,
                required: %w[cleaned publishable revertable],
                properties: {
                  cleaned: { type: :boolean },
                  publishable: { type: :boolean },
                  revertable: { type: :boolean }
                }
              }
            ]
          },
          ImportSummary: {
            type: :object,
            required: %w[id type status created_at updated_at status_detail],
            properties: {
              id: { type: :string, format: :uuid },
              type: { type: :string, enum: Import::TYPES },
              status: { type: :string, enum: %w[pending complete importing reverting revert_failed failed] },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' },
              account_id: { type: :string, format: :uuid, nullable: true },
              rows_count: { type: :integer, minimum: 0 },
              error: { type: :string, nullable: true },
              status_detail: { '$ref' => '#/components/schemas/ImportStatusSummary' }
            }
          },
          ImportDetail: {
            type: :object,
            required: %w[id type status created_at updated_at status_detail configuration stats],
            properties: {
              id: { type: :string, format: :uuid },
              type: { type: :string, enum: Import::TYPES },
              status: { type: :string, enum: %w[pending complete importing reverting revert_failed failed] },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' },
              account_id: { type: :string, format: :uuid, nullable: true },
              error: { type: :string, nullable: true },
              status_detail: { '$ref' => '#/components/schemas/ImportStatusDetail' },
              configuration: { '$ref' => '#/components/schemas/ImportConfiguration' },
              stats: { '$ref' => '#/components/schemas/ImportStats' },
              verification: { '$ref' => '#/components/schemas/ImportVerification' }
            }
          },
          ImportCollection: {
            type: :object,
            required: %w[data meta],
            properties: {
              data: {
                type: :array,
                items: { '$ref' => '#/components/schemas/ImportSummary' }
              },
              meta: {
                type: :object,
                required: %w[current_page total_pages total_count per_page],
                properties: {
                  current_page: { type: :integer, minimum: 1 },
                  next_page: { type: :integer, nullable: true },
                  prev_page: { type: :integer, nullable: true },
                  total_pages: { type: :integer, minimum: 0 },
                  total_count: { type: :integer, minimum: 0 },
                  per_page: { type: :integer, minimum: 1 }
                }
              }
            }
          },
          ImportResponse: {
            type: :object,
            required: %w[data],
            properties: {
              data: { '$ref' => '#/components/schemas/ImportDetail' }
            }
          },
          ImportSessionChunk: {
            type: :object,
            required: %w[id sequence status rows_count summary created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              sequence: { type: :integer, minimum: 1 },
              client_chunk_id: { type: :string, nullable: true },
              status: { type: :string, enum: %w[pending importing complete failed] },
              rows_count: { type: :integer, minimum: 0 },
              summary: {
                type: :object,
                additionalProperties: {
                  type: :object,
                  additionalProperties: { type: :integer }
                }
              },
              error: {
                type: :object,
                nullable: true,
                additionalProperties: true
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          ImportSession: {
            type: :object,
            required: %w[id type status chunks_count summary chunks created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              type: { type: :string, enum: %w[SureImport] },
              status: { type: :string, enum: %w[pending importing complete failed] },
              client_session_id: { type: :string, nullable: true },
              expected_chunks: { type: :integer, nullable: true, minimum: 1 },
              chunks_count: { type: :integer, minimum: 0 },
              summary: {
                type: :object,
                additionalProperties: {
                  type: :object,
                  additionalProperties: { type: :integer }
                }
              },
              error: {
                type: :object,
                nullable: true,
                additionalProperties: true
              },
              chunks: {
                type: :array,
                items: { '$ref' => '#/components/schemas/ImportSessionChunk' }
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          ImportSessionResponse: {
            type: :object,
            required: %w[data],
            properties: {
              data: { '$ref' => '#/components/schemas/ImportSession' }
            }
          },
          ProviderConnectionInstitution: {
            type: :object,
            required: %w[name],
            properties: {
              name: { type: :string, nullable: true },
              domain: { type: :string, nullable: true },
              url: { type: :string, nullable: true }
            }
          },
          ProviderConnectionAccounts: {
            type: :object,
            required: %w[total_count linked_count unlinked_count],
            properties: {
              total_count: { type: :integer, minimum: 0 },
              linked_count: { type: :integer, minimum: 0 },
              unlinked_count: { type: :integer, minimum: 0 }
            }
          },
          ProviderConnectionSyncLatest: {
            type: :object,
            required: %w[id status created_at],
            properties: {
              id: { type: :string, format: :uuid },
              status: { type: :string },
              created_at: { type: :string, format: :'date-time' },
              syncing_at: { type: :string, format: :'date-time', nullable: true },
              completed_at: { type: :string, format: :'date-time', nullable: true },
              failed_at: { type: :string, format: :'date-time', nullable: true },
              error: {
                type: :object,
                nullable: true,
                description: "Sanitized latest sync error summary. Null when the latest sync is not failed or stale.",
                required: %w[present],
                properties: {
                  present: { type: :boolean, description: "Always true when this object is present." },
                  message: { type: :string, nullable: true, description: "Stable sanitized error category message; raw provider error text is never exposed." }
                }
              }
            }
          },
          ProviderConnectionSync: {
            type: :object,
            required: %w[syncing],
            properties: {
              syncing: { type: :boolean },
              status_summary: { type: :string, nullable: true },
              last_synced_at: { type: :string, format: :'date-time', nullable: true },
              latest: {
                allOf: [ { '$ref' => '#/components/schemas/ProviderConnectionSyncLatest' } ],
                nullable: true
              }
            }
          },
          ProviderConnection: {
            type: :object,
            required: %w[id provider provider_type name status requires_update credentials_configured scheduled_for_deletion pending_account_setup institution accounts sync created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              provider: { type: :string },
              provider_type: { type: :string },
              name: { type: :string },
              status: { type: :string, nullable: true },
              requires_update: { type: :boolean, nullable: true, description: "False when the provider item does not expose this status." },
              credentials_configured: { type: :boolean, nullable: true, description: "False when credential readiness is unknown." },
              scheduled_for_deletion: { type: :boolean, nullable: true, description: "False when the provider item does not expose this status." },
              pending_account_setup: { type: :boolean, nullable: true, description: "False when account setup state is unknown." },
              institution: { '$ref' => '#/components/schemas/ProviderConnectionInstitution' },
              accounts: { '$ref' => '#/components/schemas/ProviderConnectionAccounts' },
              sync: { '$ref' => '#/components/schemas/ProviderConnectionSync' },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          ProviderConnectionCollection: {
            type: :object,
            required: %w[data],
            properties: {
              data: {
                type: :array,
                items: { '$ref' => '#/components/schemas/ProviderConnection' }
              }
            }
          },
          ImportRowMapping: {
            type: :object,
            required: %w[key type value create_when_empty creatable mappable],
            properties: {
              key: { type: :string, nullable: true },
              type: { type: :string },
              value: { type: :string, nullable: true },
              create_when_empty: { type: :boolean },
              creatable: { type: :boolean },
              mappable: {
                type: :object,
                nullable: true,
                properties: {
                  id: { type: :string, format: :uuid },
                  type: { type: :string },
                  name: { type: :string, nullable: true }
                }
              }
            }
          },
          ImportRowDiagnostic: {
            type: :object,
            required: %w[id row_number valid errors fields mappings],
            properties: {
              id: { type: :string, format: :uuid },
              row_number: { type: :integer, minimum: 1 },
              valid: { type: :boolean },
              errors: {
                type: :array,
                items: { type: :string }
              },
              fields: {
                type: :object,
                properties: {
                  account: { type: :string, nullable: true },
                  date: { type: :string, nullable: true },
                  qty: { type: :string, nullable: true },
                  ticker: { type: :string, nullable: true },
                  exchange_operating_mic: { type: :string, nullable: true },
                  price: { type: :string, nullable: true },
                  amount: { type: :string, nullable: true },
                  currency: { type: :string, nullable: true },
                  name: { type: :string, nullable: true },
                  category: { type: :string, nullable: true },
                  tags: { type: :string, nullable: true },
                  entity_type: { type: :string, nullable: true },
                  notes: { type: :string, nullable: true },
                  active: { type: :boolean, nullable: true },
                  effective_date: { type: :string, nullable: true },
                  conditions: { type: :string, nullable: true },
                  actions: { type: :string, nullable: true }
                }
              },
              mappings: {
                type: :object,
                properties: {
                  account: { '$ref' => '#/components/schemas/ImportRowMapping' },
                  category: { '$ref' => '#/components/schemas/ImportRowMapping' },
                  account_type: { '$ref' => '#/components/schemas/ImportRowMapping' },
                  tags: {
                    type: :array,
                    items: { '$ref' => '#/components/schemas/ImportRowMapping' }
                  }
                }
              }
            }
          },
          ImportRowDiagnosticCollection: {
            type: :object,
            required: %w[data meta],
            properties: {
              data: {
                type: :array,
                items: { '$ref' => '#/components/schemas/ImportRowDiagnostic' }
              },
              meta: {
                type: :object,
                required: %w[current_page total_pages total_count per_page],
                properties: {
                  current_page: { type: :integer, minimum: 1 },
                  next_page: { type: :integer, nullable: true },
                  prev_page: { type: :integer, nullable: true },
                  total_pages: { type: :integer, minimum: 0 },
                  total_count: { type: :integer, minimum: 0 },
                  per_page: { type: :integer, minimum: 1 }
                }
              }
            }
          },
          SyncableSummary: {
            type: :object,
            required: %w[type id],
            properties: {
              type: { type: :string },
              id: { type: :string, format: :uuid },
              name: { type: :string, nullable: true }
            }
          },
          SyncErrorSummary: {
            type: :object,
            required: %w[message],
            properties: {
              message: { type: :string }
            }
          },
          SyncResource: {
            type: :object,
            required: %w[id status in_progress terminal syncable children_count created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              status: { type: :string, enum: %w[pending syncing completed failed stale] },
              in_progress: { type: :boolean },
              terminal: { type: :boolean },
              syncable: { '$ref' => '#/components/schemas/SyncableSummary' },
              parent_id: { type: :string, format: :uuid, nullable: true },
              children_count: { type: :integer, minimum: 0 },
              window_start_date: { type: :string, format: :date, nullable: true },
              window_end_date: { type: :string, format: :date, nullable: true },
              pending_at: { type: :string, format: :'date-time', nullable: true },
              syncing_at: { type: :string, format: :'date-time', nullable: true },
              completed_at: { type: :string, format: :'date-time', nullable: true },
              failed_at: { type: :string, format: :'date-time', nullable: true },
              error: { nullable: true, allOf: [ { '$ref' => '#/components/schemas/SyncErrorSummary' } ] },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          SyncResponse: {
            type: :object,
            required: %w[data],
            properties: {
              data: { nullable: true, allOf: [ { '$ref' => '#/components/schemas/SyncResource' } ] }
            }
          },
          SyncCollection: {
            type: :object,
            required: %w[data meta],
            properties: {
              data: {
                type: :array,
                maxItems: 100,
                items: { '$ref' => '#/components/schemas/SyncResource' }
              },
              meta: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          Trade: {
            type: :object,
            required: %w[id date amount currency name qty price account created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              date: { type: :string, format: :date },
              amount: { type: :string },
              currency: { type: :string },
              name: { type: :string },
              notes: { type: :string, nullable: true },
              qty: { type: :string },
              price: { type: :string },
              investment_activity_label: { type: :string, nullable: true },
              account: { '$ref' => '#/components/schemas/Account' },
              security: {
                type: :object,
                nullable: true,
                properties: {
                  id: { type: :string, format: :uuid },
                  ticker: { type: :string },
                  name: { type: :string, nullable: true }
                }
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          TradeCollection: {
            type: :object,
            required: %w[trades pagination],
            properties: {
              trades: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Trade' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          Holding: {
            type: :object,
            required: %w[id date qty price amount currency account security created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              date: { type: :string, format: :date },
              qty: { type: :string, description: 'Quantity of shares held' },
              price: { type: :string, description: 'Formatted price per share' },
              amount: { type: :string },
              currency: { type: :string },
              cost_basis_source: { type: :string, nullable: true },
              account: { '$ref' => '#/components/schemas/Account' },
              security: {
                type: :object,
                required: %w[id ticker name],
                properties: {
                  id: { type: :string, format: :uuid },
                  ticker: { type: :string },
                  name: { type: :string, nullable: true }
                }
              },
              avg_cost: { type: :string, nullable: true },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          HoldingCollection: {
            type: :object,
            required: %w[holdings pagination],
            properties: {
              holdings: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Holding' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          Security: {
            type: :object,
            required: %w[id ticker kind offline created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              ticker: { type: :string },
              name: { type: :string, nullable: true },
              kind: { type: :string, enum: %w[standard cash] },
              country_code: { type: :string, nullable: true },
              exchange_mic: { type: :string, nullable: true },
              exchange_acronym: { type: :string, nullable: true },
              exchange_operating_mic: { type: :string, nullable: true },
              exchange_name: { type: :string, nullable: true },
              offline: { type: :boolean },
              offline_reason: { type: :string, nullable: true },
              website_url: { type: :string, nullable: true },
              logo_url: { type: :string, nullable: true },
              first_provider_price_on: { type: :string, format: :date, nullable: true },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          SecurityCollection: {
            type: :object,
            required: %w[securities pagination],
            properties: {
              securities: {
                type: :array,
                items: { '$ref' => '#/components/schemas/Security' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          SecurityPrice: {
            type: :object,
            required: %w[id date price price_amount currency provisional security created_at updated_at],
            properties: {
              id: { type: :string, format: :uuid },
              date: { type: :string, format: :date },
              price: { type: :string, description: 'Formatted security price' },
              price_amount: { type: :string, description: 'Exact decimal security price' },
              currency: { type: :string },
              provisional: { type: :boolean },
              security: {
                type: :object,
                required: %w[id ticker],
                properties: {
                  id: { type: :string, format: :uuid },
                  ticker: { type: :string },
                  name: { type: :string, nullable: true },
                  exchange_operating_mic: { type: :string, nullable: true }
                }
              },
              created_at: { type: :string, format: :'date-time' },
              updated_at: { type: :string, format: :'date-time' }
            }
          },
          SecurityPriceCollection: {
            type: :object,
            required: %w[security_prices pagination],
            properties: {
              security_prices: {
                type: :array,
                items: { '$ref' => '#/components/schemas/SecurityPrice' }
              },
              pagination: { '$ref' => '#/components/schemas/Pagination' }
            }
          },
          Money: {
            type: :object,
            required: %w[amount currency formatted],
            properties: {
              amount: { type: :string, description: 'Numeric amount as string' },
              currency: { type: :string, description: 'ISO 4217 currency code' },
              formatted: { type: :string, description: 'Locale-formatted money string' }
            }
          },
          FinancialPeriod: {
            type: :object, required: %w[start_date end_date],
            properties: { start_date: { type: :string, format: :date }, end_date: { type: :string, format: :date } }
          },
          SpendingPoint: {
            type: :object, required: %w[date amount],
            properties: { date: { type: :string, format: :date }, amount: { type: :string, description: 'Cumulative decimal amount in family currency' } }
          },
          CashFlowSankey: {
            type: :object, required: %w[basis income spending net_savings nodes links],
            description: 'Refunds net within each category. Parent direct amounts exclude child totals before partitioning by direction. Graph income/spending may differ from gross monthly totals; net savings agrees. Decimal strings retain FX precision. Empty flow has empty nodes and links.',
            properties: {
              basis: { type: :string, enum: [ 'net_by_category' ] },
              income: { type: :string }, spending: { type: :string }, net_savings: { type: :string },
              nodes: { type: :array, items: {
                type: :object, required: %w[id name kind value percentage category_id filter_value color],
                properties: {
                  id: { type: :string, description: 'Stable direction-prefixed category identifier or structural identifier' },
                  name: { type: :string }, kind: { type: :string, enum: %w[income expense cash_flow surplus deficit] },
                  value: { type: :string, description: 'Nonnegative decimal in envelope currency' },
                  percentage: { type: :string, description: 'Percentage of parent, or side total for root categories; structural balancing nodes use central capacity' },
                  category_id: { type: :string, format: :uuid, nullable: true },
                  filter_value: { type: :string, nullable: true, description: 'Web transaction category filter; null means no category drill-down' },
                  color: { type: :string, nullable: true, description: 'User category color; structural colors belong to the client' }
                }
              } },
              links: { type: :array, items: {
                type: :object, required: %w[source target value percentage],
                properties: {
                  source: { type: :integer, minimum: 0, description: 'Zero-based nodes index' },
                  target: { type: :integer, minimum: 0, description: 'Zero-based nodes index' },
                  value: { type: :string, description: 'Positive decimal in envelope currency' }, percentage: { type: :string }
                }
              } }
            }
          },
          CashFlowGraph: {
            type: :object, required: %w[as_of time_zone currency period sankey],
            properties: {
              as_of: { type: :string, format: :date }, time_zone: { type: :string }, currency: { type: :string },
              period: { '$ref' => '#/components/schemas/FinancialPeriod' },
              sankey: { '$ref' => '#/components/schemas/CashFlowSankey' }
            }
          },
          CashFlow: {
            type: :object,
            required: %w[month as_of time_zone currency period income spending net_savings savings_rate spending_comparison],
            properties: {
              month: { type: :string, format: :date }, as_of: { type: :string, format: :date },
              time_zone: { type: :string }, currency: { type: :string },
              period: { '$ref' => '#/components/schemas/FinancialPeriod' },
              income: { type: :string }, spending: { type: :string }, net_savings: { type: :string },
              sankey: { '$ref' => '#/components/schemas/CashFlowSankey' },
              savings_rate: { type: :string, nullable: true, description: 'Percentage points; null when income is nonpositive. May be negative.' },
              spending_comparison: {
                type: :object,
                required: %w[previous_period current_total comparison_total comparison_end_date delta current previous],
                properties: {
                  previous_period: { '$ref' => '#/components/schemas/FinancialPeriod' },
                  current_total: { type: :string }, comparison_total: { type: :string }, delta: { type: :string },
                  comparison_end_date: { type: :string, format: :date },
                  current: { type: :array, items: { '$ref' => '#/components/schemas/SpendingPoint' } },
                  previous: { type: :array, items: { '$ref' => '#/components/schemas/SpendingPoint' } }
                }
              }
            }
          },
          BalanceSheetPoint: {
            type: :object,
            required: %w[date value],
            properties: {
              date: { type: :string, format: :date },
              value: { '$ref' => '#/components/schemas/Money' }
            }
          },
          BalanceSheetAccount: {
            type: :object,
            required: %w[id name classification account_type balance currency],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              classification: { type: :string, enum: %w[asset liability] },
              account_type: { type: :string },
              logo_url: { type: :string, nullable: true },
              balance: { '$ref' => '#/components/schemas/Money' },
              currency: { type: :string },
              path: { type: :string, nullable: true }
            }
          },
          BalanceSheet: {
            type: :object,
            required: %w[currency net_worth assets liabilities net_worth_series accounts],
            properties: {
              currency: { type: :string, description: 'Family primary currency' },
              net_worth: { '$ref' => '#/components/schemas/Money' },
              assets: { '$ref' => '#/components/schemas/Money' },
              liabilities: { '$ref' => '#/components/schemas/Money' },
              net_worth_series: {
                type: :array,
                items: { '$ref' => '#/components/schemas/BalanceSheetPoint' }
              },
              accounts: {
                type: :array,
                items: { '$ref' => '#/components/schemas/BalanceSheetAccount' }
              }
            }
          },
          HomeSectionLayout: {
            type: :object,
            properties: {
              col_span: { type: :string, enum: %w[single full] },
              grow: { type: :boolean },
              min_height: { type: :integer },
              width_toggle: { type: :boolean },
              height_preset: { type: :string, enum: %w[compact auto tall] },
              height_px: { type: :integer }
            }
          },
          HomeSection: {
            type: :object,
            required: %w[key visible collapsible collapsed],
            properties: {
              key: { type: :string },
              visible: { type: :boolean },
              collapsible: { type: :boolean },
              collapsed: { type: :boolean },
              layout: { '$ref' => '#/components/schemas/HomeSectionLayout' }
            }
          },
          HomeSankeyNode: {
            type: :object,
            required: %w[id name value percentage],
            properties: {
              id: { type: :string },
              name: { type: :string },
              filter_value: { type: :string, nullable: true },
              value: { type: :number },
              percentage: { type: :number },
              color: { type: :string, nullable: true }
            }
          },
          HomeSankeyLink: {
            type: :object,
            required: %w[source target value percentage],
            properties: {
              source: { type: :integer, minimum: 0 },
              target: { type: :integer, minimum: 0 },
              value: { type: :number },
              color: { type: :string, nullable: true },
              percentage: { type: :number }
            }
          },
          HomeSankey: {
            type: :object,
            required: %w[nodes links currency_symbol],
            properties: {
              nodes: { type: :array, items: { '$ref' => '#/components/schemas/HomeSankeyNode' } },
              links: { type: :array, items: { '$ref' => '#/components/schemas/HomeSankeyLink' } },
              currency_symbol: { type: :string }
            }
          },
          HomeMoneyFlowBar: {
            type: :object,
            required: %w[date label short_label income expense highlighted partial],
            properties: {
              date: { type: :string, format: :date },
              label: { type: :string },
              short_label: { type: :string },
              income: { type: :number },
              expense: { type: :number },
              highlighted: { type: :boolean },
              partial: { type: :boolean }
            }
          },
          HomeMoneyFlow: {
            type: :object,
            required: %w[bars period month month_label income expense balance balance_tone account_ids accounts accessible_account_ids all_accounts_selected income_href expense_href],
            properties: {
              bars: { type: :array, items: { '$ref' => '#/components/schemas/HomeMoneyFlowBar' } },
              period: {
                type: :object,
                required: %w[start_date end_date date_range_label],
                properties: {
                  start_date: { type: :string, format: :date },
                  end_date: { type: :string, format: :date },
                  date_range_label: { type: :string }
                }
              },
              month: { type: :string, format: :date },
              month_label: { type: :string },
              income: { '$ref' => '#/components/schemas/Money' },
              expense: { '$ref' => '#/components/schemas/Money' },
              balance: { '$ref' => '#/components/schemas/Money' },
              balance_tone: { type: :string, enum: %w[positive negative neutral] },
              account_ids: { type: :array, items: { type: :string }, nullable: true },
              accounts: {
                type: :array,
                items: { type: :object, required: %w[id name], properties: { id: { type: :string }, name: { type: :string } } }
              },
              accessible_account_ids: { type: :array, items: { type: :string } },
              all_accounts_selected: { type: :boolean },
              income_href: { type: :string },
              expense_href: { type: :string }
            }
          },
          HomeSpendingPoint: {
            type: :object,
            required: %w[day value date date_formatted],
            properties: {
              day: { type: :integer },
              value: { type: :number },
              date: { type: :string, format: :date },
              date_formatted: { type: :string }
            }
          },
          HomeSpendingTrend: {
            type: :object,
            required: %w[month month_label period previous_period days current_days axis_labels current previous current_total previous_total delta delta_tone previous_label date_range_short],
            properties: {
              month: { type: :string, format: :date },
              month_label: { type: :string },
              period: {
                type: :object,
                required: %w[start_date end_date date_range_label],
                properties: {
                  start_date: { type: :string, format: :date },
                  end_date: { type: :string, format: :date },
                  date_range_label: { type: :string }
                }
              },
              previous_period: { '$ref' => '#/components/schemas/FinancialPeriod' },
              days: { type: :integer },
              current_days: { type: :integer },
              axis_labels: { type: :array, items: { type: :string } },
              current: { type: :array, items: { '$ref' => '#/components/schemas/HomeSpendingPoint' } },
              previous: { type: :array, items: { '$ref' => '#/components/schemas/HomeSpendingPoint' } },
              current_total: { '$ref' => '#/components/schemas/Money' },
              previous_total: { '$ref' => '#/components/schemas/Money' },
              delta: { '$ref' => '#/components/schemas/Money' },
              delta_tone: { type: :string, enum: %w[up down flat] },
              previous_label: { type: :string },
              previous_comparison_day: { type: :integer, nullable: true },
              date_range_short: { type: :string }
            }
          },
          HomeOutflowsCategory: {
            type: :object,
            required: %w[id name filter_value amount currency percentage color clickable],
            properties: {
              id: { type: :string },
              name: { type: :string },
              filter_value: { type: :string },
              amount: { type: :number },
              currency: { type: :string },
              percentage: { type: :number },
              color: { type: :string },
              icon: { type: :string, nullable: true },
              clickable: { type: :boolean }
            }
          },
          HomeOutflows: {
            type: :object,
            required: %w[categories total total_formatted currency currency_symbol period],
            properties: {
              categories: { type: :array, items: { '$ref' => '#/components/schemas/HomeOutflowsCategory' } },
              total: { type: :number },
              total_formatted: { type: :string },
              currency: { type: :string },
              currency_symbol: { type: :string },
              period: { '$ref' => '#/components/schemas/FinancialPeriod' }
            }
          },
          HomeBalanceSheetAccount: {
            type: :object,
            required: %w[id name path balance currency weight],
            properties: {
              id: { type: :string, format: :uuid },
              name: { type: :string },
              path: { type: :string },
              balance: { '$ref' => '#/components/schemas/Money' },
              currency: { type: :string },
              weight: { type: :string },
              logo_url: { type: :string, nullable: true }
            }
          },
          HomeAccountGroup: {
            type: :object,
            required: %w[key name color weight total accounts],
            properties: {
              key: { type: :string },
              name: { type: :string },
              color: { type: :string },
              weight: { type: :string },
              total: { '$ref' => '#/components/schemas/Money' },
              accounts: { type: :array, items: { '$ref' => '#/components/schemas/HomeBalanceSheetAccount' } }
            }
          },
          HomeClassificationGroup: {
            type: :object,
            required: %w[key name icon total weight syncing account_groups],
            properties: {
              key: { type: :string, enum: %w[asset liability] },
              name: { type: :string },
              icon: { type: :string },
              total: { '$ref' => '#/components/schemas/Money' },
              weight: { type: :string },
              syncing: { type: :boolean },
              account_groups: { type: :array, items: { '$ref' => '#/components/schemas/HomeAccountGroup' } }
            }
          },
          HomeBalanceSheet: {
            type: :object,
            required: %w[currency net_worth assets_total liabilities_total syncing classification_groups always_expanded],
            properties: {
              currency: { type: :string },
              net_worth: { '$ref' => '#/components/schemas/Money' },
              assets_total: { '$ref' => '#/components/schemas/Money' },
              liabilities_total: { '$ref' => '#/components/schemas/Money' },
              syncing: { type: :boolean },
              classification_groups: { type: :array, items: { '$ref' => '#/components/schemas/HomeClassificationGroup' } },
              always_expanded: { type: :array, items: { type: :string } }
            }
          },
          HomeNetWorthTrend: {
            type: :object,
            required: %w[current change percent color direction],
            properties: {
              current: { '$ref' => '#/components/schemas/Money' },
              change: { '$ref' => '#/components/schemas/Money' },
              percent: { type: :string },
              color: { type: :string },
              direction: { type: :string, enum: %w[up down flat] }
            }
          },
          HomeNetWorth: {
            type: :object,
            required: %w[series comparison_label syncing],
            properties: {
              series: { type: :array, items: { '$ref' => '#/components/schemas/BalanceSheetPoint' } },
              trend: { '$ref' => '#/components/schemas/HomeNetWorthTrend', nullable: true },
              comparison_label: { type: :string },
              syncing: { type: :boolean }
            }
          },
          HomeHolding: {
            type: :object,
            required: %w[ticker weight value],
            properties: {
              ticker: { type: :string },
              name: { type: :string, nullable: true },
              logo_url: { type: :string, nullable: true },
              weight: { type: :string },
              value: { '$ref' => '#/components/schemas/Money' },
              return_percent: { type: :string, nullable: true },
              color: { type: :string, nullable: true }
            }
          },
          HomeInvestmentActivity: {
            type: :object,
            required: %w[label contributions withdrawals trades_count],
            properties: {
              label: { type: :string },
              contributions: { '$ref' => '#/components/schemas/Money' },
              withdrawals: { '$ref' => '#/components/schemas/Money' },
              trades_count: { type: :integer }
            }
          },
          HomeInvestmentSummary: {
            type: :object,
            required: %w[present],
            properties: {
              present: { type: :boolean },
              portfolio_value: { '$ref' => '#/components/schemas/Money' },
              total_return: {
                type: :object,
                required: %w[value percent color],
                nullable: true,
                properties: {
                  value: { '$ref' => '#/components/schemas/Money' },
                  percent: { type: :string },
                  color: { type: :string }
                }
              },
              holdings: { type: :array, items: { '$ref' => '#/components/schemas/HomeHolding' } },
              activity: { '$ref' => '#/components/schemas/HomeInvestmentActivity', nullable: true }
            }
          },
          HomeInsight: {
            type: :object,
            required: %w[id type title body priority status icon_key icon_css_color sentiment acknowledge_path],
            properties: {
              id: { type: :string, format: :uuid },
              type: { type: :string },
              title: { type: :string },
              body: { type: :string },
              priority: { type: :string },
              status: { type: :string },
              generated_at: { type: :string, format: :'date-time', nullable: true },
              icon_key: { type: :string },
              icon_css_color: { type: :string },
              sentiment: { type: :string },
              key_figure: {
                type: :object,
                required: %w[value caption],
                nullable: true,
                properties: {
                  value: { type: :string },
                  caption: { type: :string }
                }
              },
              acknowledge_path: { type: :string }
            }
          },
          HomeInsights: {
            type: :object,
            required: %w[enabled insights],
            properties: {
              enabled: { type: :boolean },
              insights: { type: :array, items: { '$ref' => '#/components/schemas/HomeInsight' } }
            }
          },
          HomeCashForecast: {
            type: :object,
            required: %w[starting_balance ending_balance lowest below_zero series events],
            description: '30-day cash-on-hand projection using checking balances, recurring checking activity, and unpaid dynamic credit-card statement payments in the family currency. Cards require an explicitly configured payment due day. Only occurrences due today through day 30 are included, on their scheduled dates; overdue occurrences are excluded. Other depository subtypes and ordinary transfers are excluded. Null when the viewer has no visible, accessible checking account in the family currency.',
            properties: {
              starting_balance: { '$ref' => '#/components/schemas/Money' },
              ending_balance: { '$ref' => '#/components/schemas/Money' },
              lowest: {
                type: :object,
                required: %w[date balance],
                nullable: true,
                properties: {
                  date: { type: :string, format: :date },
                  balance: { '$ref' => '#/components/schemas/Money' }
                }
              },
              below_zero: { type: :boolean },
              series: {
                type: :array,
                description: 'Daily projected balance, starting today (31 points for the 30-day window).',
                items: {
                  type: :object,
                  required: %w[date balance],
                  properties: {
                    date: { type: :string, format: :date },
                    balance: { '$ref' => '#/components/schemas/Money' }
                  }
                }
              },
              events: {
                type: :array,
                items: {
                  type: :object,
                  required: %w[date name amount direction],
                  properties: {
                    date: { type: :string, format: :date },
                    name: { type: :string },
                    amount: { '$ref' => '#/components/schemas/Money' },
                    direction: { type: :string, enum: %w[inflow outflow] }
                  }
                }
              }
            }
          },
          HomeResponse: {
            type: :object,
            required: %w[has_accounts first_name two_column preview period sections balance_sheet net_worth cashflow_sankey cash_forecast money_flow spending_trend outflows investment_summary insights],
            properties: {
              has_accounts: { type: :boolean },
              first_name: { type: :string },
              two_column: { type: :boolean },
              preview: { type: :boolean },
              period: {
                type: :object,
                required: %w[start_date end_date label],
                properties: {
                  start_date: { type: :string, format: :date },
                  end_date: { type: :string, format: :date },
                  label: { type: :string }
                }
              },
              sections: { type: :array, items: { '$ref' => '#/components/schemas/HomeSection' } },
              balance_sheet: { '$ref' => '#/components/schemas/HomeBalanceSheet' },
              net_worth: { '$ref' => '#/components/schemas/HomeNetWorth' },
              cashflow_sankey: { '$ref' => '#/components/schemas/HomeSankey' },
              cash_forecast: { '$ref' => '#/components/schemas/HomeCashForecast', nullable: true },
              money_flow: { '$ref' => '#/components/schemas/HomeMoneyFlow' },
              spending_trend: { '$ref' => '#/components/schemas/HomeSpendingTrend' },
              outflows: { '$ref' => '#/components/schemas/HomeOutflows' },
              investment_summary: { '$ref' => '#/components/schemas/HomeInvestmentSummary' },
              insights: { '$ref' => '#/components/schemas/HomeInsights' }
            }
          },
          ResetInitiatedResponse: {
            type: :object,
            required: %w[message status job_id family_id status_url],
            properties: {
              message: { type: :string },
              status: { type: :string, enum: %w[queued] },
              job_id: {
                type: :string,
                description: 'Informational Active Job identifier returned by the queue adapter; reset status is family-scoped, not job-scoped.'
              },
              family_id: { type: :string, format: :uuid, description: 'UUID of the family being reset.' },
              status_url: { type: :string }
            }
          },
          ResetStatusResponse: {
            type: :object,
            required: %w[status family_id reset_complete counts],
            properties: {
              status: {
                type: :string,
                enum: %w[complete data_remaining],
                description: 'Counts-based family reset status at response time.'
              },
              family_id: { type: :string, format: :uuid, description: 'UUID of the family whose reset target counts were checked.' },
              reset_complete: {
                type: :boolean,
                description: 'True when all reset target counts are zero at response time. This is a family data snapshot, not a durable per-job completion record.'
              },
              counts: {
                type: :object,
                required: reset_count_keys,
                additionalProperties: { type: :integer, minimum: 0 },
                properties: reset_count_keys.index_with { { type: :integer, minimum: 0 } }
              }
            }
          }
        }
      }
    }
  }

  config.openapi_specs["openapi.yaml"][:components][:schemas].merge!(
    JSON.parse(Rails.root.join("docs/api/financekit/schemas.json").read)
  )

  config.openapi_format = :yaml
end
