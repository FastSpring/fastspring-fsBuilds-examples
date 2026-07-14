require('dotenv').config();
const express = require('express');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

async function validateCreatorCode(code) {
    const url = `${process.env.NEXUS_BASE_URL}/manage/members/${code}`;
    const res = await fetch(url, {
        headers: { 'X-SHARED-SECRET': process.env.NEXUS_PUBLIC_KEY }
    });
    if (res.status === 400) return null;
    if (!res.ok) throw new Error(`Validation error: ${res.status}`);
    return res.json();
}

async function postAttribution(code, order, item) {
    const res = await fetch(`${process.env.NEXUS_BASE_URL}/attributions/transactions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-SHARED-SECRET': process.env.NEXUS_PRIVATE_KEY
        },
        body: JSON.stringify({
            code: code,
            subtotal: Math.round(order.subtotal * 100),
            currency: order.currency,
            description: item.display,
            skuId: item.product,
            transactionId: order.id,
            transactionDate: new Date(order.changed).toISOString()
        })
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Attribution failed: ${res.status} ${text}`);
    }
    return res.json();
}

app.post('/webhook', async (req, res) => {
    const events = req.body.events;

    if (!events || !events.length) {
        console.log('No events in payload, skipping');
        return res.sendStatus(200);
    }

    const event = events[0];

    if (event.type !== 'order.completed') {
        console.log(`Skipping event type: ${event.type}`);
        return res.sendStatus(200);
    }

    const order = event.data;
    const items = order.items;

    if (!items || !items.length) {
        console.log('No items in order, skipping');
        return res.sendStatus(200);
    }

    const item = items[0];
    const couponCode = item.coupon;

    if (!couponCode) {
        console.log('No coupon code on order, skipping attribution');
        return res.sendStatus(200);
    }

    console.log(`Coupon code found: ${couponCode}`);

    try {
        const creator = await validateCreatorCode(couponCode);

        if (!creator) {
            console.log(`Code ${couponCode} is not a valid Nexus creator code, skipping`);
            return res.sendStatus(200);
        }

        console.log(`Valid Nexus creator: ${creator.name}`);

        const attribution = await postAttribution(couponCode, order, item);
        console.log('Attribution posted successfully:', attribution);

        res.sendStatus(200);

    } catch (err) {
        console.error('Error processing attribution:', err.message);
        res.sendStatus(500);
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});