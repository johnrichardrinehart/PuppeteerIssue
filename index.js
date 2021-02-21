"use strict";

const p = require("puppeteer");
const got = require("got");


const express = require("express");
const app = express();

// const puppeteer = require("puppeteer-extra");
// const StealthPlugin = require("puppeteer-extra-plugin-stealth");
// puppeteer.use(StealthPlugin());

let browser;

async function init() {
    browser = await p.launch({
        headless: true,
        ignoreHTTPSErrors: true,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-sync",
            "--ignore-certificate-errors",
            "--lang=en-US,en;q=0.9",
        ],
        defaultViewport: {width:1366, height:768},
    });
}

app.get("/fetch", async (req, res) => {
    console.log(`received a request for ${req.query.url}`);

    // initialize "globals"
    let page;

    const payload = {
        html: "",
        cookies: "",
        status_code: -1,
        status_text: "",
        requested_url: req.query.url,
        resolved_url: "",
        error:  "",
    };

    try {
        page = await browser.newPage();

        await page.setRequestInterception(true);

        
        page.on("request", async request => {

            console.log(`fetching ${request.url()}`);

            const options = {
                throwHttpErrors: false,
                timeout: 60*1000,
                retry: 0,
                responseType: "buffer",
            };

            let response

            try {
                response = await got(request.url(), options); 
            } catch (err) {
                console.log(`request to ${request.url()} failed: ${err}`, err);
                console.log(`${error.response}`)
                request.abort();
            } finally {
                console.log(`got `, response.statusCode)

                await request.respond({
                    // status: 500, // NOTE: making this an IANA status code unblocks the main flow
                    status: response.statusCode, // NOTE: If this is not in then everything breaks
                    headers: response.headers,
                    body: response.body,
                });
            }
        })

        let response = await page.goto(req.query.url,
            {
                timeout: 45 * 1000, // 5m
            });

        console.log("received a response!");

        // response
        payload.status_code = response?.status();
        payload.status_text = response?.statusText();
        payload.resolved_url = response?.url(); // If there's no response then this is null

        // 200-like status
        if (!response?.ok()) {
            throw `status: ${response?.status()}, response: ${response?.statusText()}`;
        }


        if (req.query.cookies === "true") {
            payload.cookies = await page.cookies();
        }

        let content = await page.content();

        payload.html = content;
        res.status(200);
        res.set("content-type", "text/json");
    } catch (e) {
        res.status(500);
        payload.error = e.toString();
    } finally {

        res.json(payload); // payload.error is non-null if catch
        res.end();

        if (!payload.error) {
            console.log(`successfully processed ${req.query.url}`);
        } else {
            console.log(`${req.method} request to ${req.query.url} failed: ${payload.error}`);
        }

        page.close().catch((e) => { console.log(`failed to close page for ${req.query.url}: ${e}`); });

    }
});

app.listen(8000, async () => {
    await init(); // initialize the browser

    console.log(`listening on port 8000 (${process.pid})`);
});
