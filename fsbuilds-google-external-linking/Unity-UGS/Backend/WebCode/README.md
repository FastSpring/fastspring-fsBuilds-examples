## Web Store Frontend: Secure Checkout with FastSpring

This frontend script handles rendering a secure FastSpring embedded checkout based on query parameters sent from Unity. It is responsible for:

- Validating and decoding the checkout payload
- Initializing the FastSpring secure session
- Customizing the UI for each product
- Handling post-checkout success or cancellation
- Returning to the game via deeplink or URL scheme

---

## Expected URL Parameters

The store expects the following URL parameters to be passed by Unity:

| Parameter       | Required | Description |
|----------------|----------|-------------|
| `product`       | ✅        | Product identifier (e.g. `coinpack-150`) |
| `securePayload` | ✅        | Base64-encoded and URL-escaped encrypted payload |
| `secureKey`     | ✅        | Base64-encoded and URL-escaped encryption key |
| `returnUrl`     | ✅        | App URL to redirect to after checkout (e.g. `fastspring://shop-return`) |

---

## Payload Decoding and FastSpring Secure Initialization

```js
const decodedPayload = decodeURIComponent(securePayload);
const decodedKey = decodeURIComponent(secureKey);

fastspring.builder.secure(decodedPayload, decodedKey);
```

## Configure HTML with parameters: 
There are some parameters to be configured into the html to run the webshop 
```
data-storefront="USE_YOUR_URL/embedded-store"
data-access-key="USE_YOUR_ACCESS_KEY"
```

(Mind the - symbol of Access key)

These parameters can be obtained from FastSpring steps [here](https://github.com/SamuraiCoder/FastSpringPOC/tree/main/Unity-UGS#fastspring-account-configuration)
