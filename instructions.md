Vamos criar um projeto novo para o SDK para frontend (js/ts) para nosso sistema IAM, com toda a estrutura de pastas .

- As definições do SDK foram definidas na RFC de número 0009 (`~/docs/rfc/RFCs/`)

- Esse SDK deve possuir os mesmo métodos e funcionalidades que o SDK do python (`~/docs/iam/iam-sdk-python/`), além da funcionalidade de batch_is_authorized e características descritas na RFC.

- Esse SDK deve ser escrito em TypeScript e deve ser agnóstico de framework, ou seja, deve funcionar em qualquer framework frontend (React, Angular, Vue, etc.).

- Esse SDK deve ter versionamento pois será publicado em um repositório público (como npm) e deve seguir as melhores práticas de versionamento semântico (semver).

- A implementação do endpoint Cedar Agent já foi implementado, possivelmente com pequenas modificações em relação à RFC, ele é a base para a implementação do SDK. Vide em `~/docs/iam/iam-authz-cedar-agent`

- A implementação do endpoint BFF já foi implementada, possivelmente com pequenas modificações em relação à RFC, ele é a base para a implementação do SDK. Vide em `~/docs/iam/iam/`