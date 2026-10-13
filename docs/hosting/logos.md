# Account, Merchant and Security Logos

Sure has integration with the [Brandfetch Logo Link](https://brandfetch.com/developers/logo-api) service to provide logos for accounts, merchants and securities.
Logos are currently matched in the following ways:

- Accounts use their institution domain, including domains entered manually; provider-supplied and uploaded logos remain fallback sources.
- Merchants use stored logo URLs. A merchant website can generate a Brandfetch URL when Brandfetch is configured; automatic merchant detection can also discover the website.
- Securities use the existing display-logo resolver: website domains, ticker symbols, crypto symbols, or provider-supplied logos, depending on the security.

> [!NOTE]
> Currently ticker symbol matching cannot specify the exchange and since US exchanges are prioritized, securities from other exchanges might not have the right logo.

## Enabling Brandfetch Integration

A Brandfetch Client ID is required and to obtain a client ID, sign up for an account [here](https://brandfetch.com/developers/logo-api).

Once you enter the Client ID into the Sure settings under the `Self-Hosting` section, logos from Brandfetch integration will be enabled.
Alternatively, you can provide the client id using the `BRAND_FETCH_CLIENT_ID` environment variable to the web and worker services.

![CLIENT_ID screenshot](logos-clientid.png)

## SPA logo display

The SPA uses the same server-side Brandfetch settings and logo resolvers as the ERB pages. No separate frontend client ID or logo API configuration is needed.

Logos appear on account rows and headers, provider connection cards, transaction rows and account activity, merchant picker selections and options, upcoming transactions, and investment holdings. Investment activity uses its security's logo before the merchant logo.

Transaction API responses include a nullable top-level `logo_url`, plus `website_url` and `logo_url` in the merchant object. Stored merchant Brandfetch URLs are adjusted at render time to the current standard (40×40) or high-resolution (120×120) setting without changing stored data. The SPA API schemas are generated from OpenAPI.

The shared SPA logo component lazy-loads images and reveals the existing initials or icon fallback if an image fails. Changing the logo source resets that failure state. When Brandfetch is not configured, available provider or uploaded logos still work; records without a logo retain their fallback.
