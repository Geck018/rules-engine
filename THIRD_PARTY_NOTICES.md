# Third-party notices

This project uses the following third-party software.

## @huggingface/transformers (Transformers.js)

- Package: `@huggingface/transformers`
- Project: [Transformers.js](https://github.com/huggingface/transformers.js)
- Copyright: Hugging Face and the Transformers.js contributors
- License: Apache License 2.0
- Used for: in-browser embedding and text-generation pipelines in
  `@geck018/rules-engine/browser`

The library is installed and shipped as a normal npm dependency (resolved from
`node_modules` / your bundler). It is **not** loaded from a CDN at runtime.

Model *weights* (e.g. MiniLM, Qwen ONNX) may still be downloaded once from a
model host (Hugging Face Hub by default) and then cached in the browser. That
is separate from the Transformers.js library itself.

A copy of the Apache License 2.0 text is available at:
https://www.apache.org/licenses/LICENSE-2.0

---

## Apache License 2.0 (summary)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed
under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR
CONDITIONS OF ANY KIND, either express or implied. See the License for the
specific language governing permissions and limitations under the License.
