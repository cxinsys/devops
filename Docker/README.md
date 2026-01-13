# Docker Study

Docker 학습을 위한 참고 자료 및 블로그 글 소재 모음

---

## 참고 자료

### 개념 이해
| 주제 | 링크 |
|------|------|
| 컨테이너 격리 이해하기 | [velog.io/@200ok](https://velog.io/@200ok/Docker-%EC%BB%A8%ED%85%8C%EC%9D%B4%EB%84%88-%EA%B2%A9%EB%A6%AC-%EC%9D%B4%ED%95%B4%ED%95%98%EA%B8%B0) |
| VM vs 컨테이너 비교 | [brunch.co.kr/@wikibook](https://brunch.co.kr/@wikibook/87) |

### 입문 & 실습
| 주제 | 링크 |
|------|------|
| 도커 입문편 (컨테이너 기초 ~ 서버 배포) | [44bits.io](https://www.44bits.io/ko/post/easy-deploy-with-docker) |
| Docker Workshop (공식) | [docs.docker.com](https://docs.docker.com/get-started/workshop/) |

### 네트워킹
| 주제 | 링크 |
|------|------|
| Docker Compose 네트워킹 톺아보기 | [codesnapmag.hashnode.dev](https://codesnapmag.hashnode.dev/docker-networking-docker-compose) |
| Docker Compose 네트워크 실습 | [velog.io/@hyeongjun-hub](https://velog.io/@hyeongjun-hub/Docker-compose%EC%9D%98-%EB%84%A4%ED%8A%B8%EC%9B%8C%ED%81%AC%EB%B6%80%ED%84%B0-%EC%8B%A4%EC%8A%B5%EA%B9%8C%EC%A7%80) |

---

## 블로그 글 소재 추천

### Frontend
| 소재 | 핵심 포인트 |
|------|-------------|
| React/Vue 개발환경 도커로 구축하기 | `docker run -v` 볼륨 마운트로 Hot Reload 개발 |
| 프론트엔드 개발자의 첫 Dockerfile 작성기 | node 이미지 기반 빌드 과정 |

### Backend
| 소재 | 핵심 포인트 |
|------|-------------|
| Docker로 로컬 DB 세팅하기 (PostgreSQL/Redis) | `docker run -p` 포트 매핑 활용 |
| 컨테이너 로그로 API 디버깅하기 | `docker logs -f` 실시간 모니터링 |

### DevOps
| 소재 | 핵심 포인트 |
|------|-------------|
| VM vs Container 아키텍처 비교 | GB/분 단위 vs MB/초 단위 차이 |
| Docker Compose로 개발 워크플로우 구축 | 코드 수정 → 자동 반영 → 확인 사이클 |

### Security
| 소재 | 핵심 포인트 |
|------|-------------|
| CVE 취약점 95% 감소시키는 도커 보안의 원리 | Docker Hardened Images + SBOM |
| 컨테이너 격리: 프로세스 수준 보안의 이해 | 호스트 OS 커널 공유 구조 |
