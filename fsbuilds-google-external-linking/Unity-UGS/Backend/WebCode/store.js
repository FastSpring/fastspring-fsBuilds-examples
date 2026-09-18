window.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);

    const product = urlParams.get("product");
    const securePayload = urlParams.get("securePayload");
    const secureKey = urlParams.get("secureKey");
    const returnUrl = urlParams.get("returnUrl");
    const externalTransactionToken = urlParams.get("externalTransactionToken");

    if (!product || !securePayload || !secureKey) {
        document.getElementById("fsc-embedded-checkout-container").innerHTML = `
            <p>Missing product or token in URL parameters.</p>
        `;
        return;
    }

    const validProducts = {
        "coinpack-150": {
            title: "MEGA 100",
            subtitle: "Coin Pack + 50 Bonus Coins",
            image: "img/coin-webshop.png",
            type: "one-time",
            amount: 150, // coins granted; carried back to the app on the return URL
            thankYouMessage: "Thank you for buying the",
            productName: "MEGA 100 Coin Pack with<br>50 Bonus Coins!",
            completionMessage: "You have been charged"
        },
        "bronze-monthly": {
            title: "Photo App Premium",
            subtitle: "Monthly Subscription",
            image: "img/subscription-webshop.png",
            type: "subscription",
            thankYouMessage: "Thank you for subscribing to",
            productName: "Photo App Premium!",
            completionMessage: "Your subscription of"
        }
    };

    const productData = validProducts[product];
    const header = document.getElementById("checkout-header");
    if (productData && header) {
        header.innerHTML = `
            <img src="${productData.image}" alt="${productData.title}" />
            <h1>${productData.title}</h1>
            <p>${productData.subtitle}</p>
        `;
    }

    const decodedPayload = decodeURIComponent(securePayload);
    const decodedKey = decodeURIComponent(secureKey);

    // Step 1: Construct secure payload
    fastspring.builder.secure(decodedPayload, decodedKey);

    // Add error handler
    window.onFSError = function(error) {
        console.error("[WebCheckout] FastSpring Error:", error);
        alert("FastSpring Error: " + JSON.stringify(error));
    };

    // Step 2: Handle post-checkout popup closure
    window.onFSPopupClosed = function(orderReference) {
        const container = document.getElementById("fsc-embedded-checkout-container");
        const header = document.getElementById("checkout-header");
        if (header) header.style.display = "none";

        if (orderReference && orderReference.reference) {
            // Purchase completed successfully
            container.innerHTML = `
              <div class="thankyou-overlay">
                <div class="thankyou-card">
                  <p class="thankyou-message">Purchase Successful!</p>
                  <p>Returning to game...</p>
                  <button class="return-btn" onclick="redirectBack()">OK</button>
                </div>
              </div>
            `;

            // Auto-return after 3 seconds if OK not tapped
            setTimeout(() => {
                redirectBack();
            }, 3000);

        } else {
            // Purchase cancelled
            container.innerHTML = `
                <div class="thankyou-overlay">
                    <div class="thankyou-card">
                        <h2>Purchase Cancelled</h2>
                        <p>No order was completed.</p>
                        <button class="return-btn" onclick="redirectBack()">Return Back</button>
                    </div>
                </div>
            `;
        }
    };

    // Step 3: Handle return
    window.redirectBack = function () {
        if (returnUrl) {
            const productInfo = validProducts[product];
            const isSubscription = productInfo?.type === "subscription";

            const params = new URLSearchParams();
            if (!isSubscription && productInfo?.amount) {
                params.set("amount", String(productInfo.amount));
            }
            // Carry the Google external transaction token back into the app so
            // reporting doesn't depend on in-memory state surviving checkout
            if (externalTransactionToken) {
                params.set("externalTransactionToken", externalTransactionToken);
            }
            const query = params.toString();
            window.location.href = query ? `${returnUrl}?${query}` : returnUrl;
        }
    };
});
