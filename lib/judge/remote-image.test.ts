import assert from "node:assert/strict";
import test from "node:test";
import { parsePublicImageUrl } from "@/lib/images/remote";

test("requester image URLs accept public http origins", () => {
  assert.equal(parsePublicImageUrl("https://images.example.com/item.jpg").toString(), "https://images.example.com/item.jpg");
});

test("requester image URLs reject local and private origins", () => {
  for (const url of [
    "http://localhost/image.jpg",
    "http://127.0.0.1/image.jpg",
    "http://10.0.0.8/image.jpg",
    "http://192.168.1.2/image.jpg",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/image.jpg",
  ]) assert.throws(() => parsePublicImageUrl(url));
});
